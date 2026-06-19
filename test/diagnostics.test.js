const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { set } = require('../src/lib/config');
const { hashPin } = require('../src/lib/pin');
const { log } = require('../src/lib/audit');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tardiness-diag-'));
}

async function authedAppWithTempDb() {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'tardiness.db');
  const db = createDb({ path: dbPath });
  set(db, 'admin_pin_hash', await hashPin('867530'));
  // seed some audit entries
  log(db, { action: 'wizard.set_school', details: { school_name: 'Test' } });
  log(db, { action: 'wizard.set_year', details: { academic_year: '2025/2026' } });
  log(db, { action: 'wizard.set_pin' });
  log(db, { action: 'student.add', actor: 'admin', details: { student_id: 'P1-001' } });
  log(db, { action: 'tardiness.mark', details: { student_id: 1 } });
  log(db, { action: 'backup.created', details: { bytes: 1024 } });
  const app = createApp({ db, dbPath });
  return { app, db, dbPath, dir };
}

async function cleanup({ db, dir }) {
  try { db.close(); } catch { /* */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// ============ /api/audit ============

test('GET /api/audit requires PIN', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/audit');
    assert.strictEqual(res.status, 401);
  } finally { await cleanup(ctx); }
});

test('GET /api/audit returns recent audit entries newest-first', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/audit').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.ok(res.body.entries.length >= 6);
    // Newest first (highest id first)
    for (let i = 1; i < res.body.entries.length; i++) {
      assert.ok(res.body.entries[i - 1].id >= res.body.entries[i].id);
    }
  } finally { await cleanup(ctx); }
});

test('GET /api/audit?limit=3 returns at most 3 entries', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/audit?limit=3').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.entries.length <= 3);
  } finally { await cleanup(ctx); }
});

test('GET /api/audit?action=backup filters by action prefix', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/audit?action=backup').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.entries.length >= 1);
    for (const e of res.body.entries) {
      assert.ok(e.action.startsWith('backup'), `expected action to start with backup, got: ${e.action}`);
    }
  } finally { await cleanup(ctx); }
});

test('GET /api/audit?action=wizard returns wizard-related entries', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/audit?action=wizard').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.entries.length >= 3);
    const actions = res.body.entries.map(e => e.action);
    assert.ok(actions.includes('wizard.set_school'));
    assert.ok(actions.includes('wizard.set_year'));
    assert.ok(actions.includes('wizard.set_pin'));
  } finally { await cleanup(ctx); }
});

// ============ /api/diagnostics ============

test('GET /api/diagnostics requires PIN', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/diagnostics');
    assert.strictEqual(res.status, 401);
  } finally { await cleanup(ctx); }
});

test('GET /api/diagnostics returns complete blob with all sections', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    // Add a student and a tardiness event so DB stats are non-zero
    db_setup(ctx.db);
    const res = await request(ctx.app).get('/api/diagnostics').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.generated_at);
    assert.ok(res.body.server);
    assert.ok(typeof res.body.server.app_version === 'string');
    assert.ok(typeof res.body.server.node_version === 'string');
    assert.ok(typeof res.body.server.uptime_seconds === 'number');
    assert.ok(res.body.url);
    assert.ok(res.body.url.public_url);
    assert.ok(res.body.database);
    assert.strictEqual(res.body.database.student_count, 1);
    assert.strictEqual(res.body.database.event_count, 1);
    assert.strictEqual(res.body.database.active_student_count, 1);
    assert.ok(res.body.backup);
    assert.ok(Array.isArray(res.body.recent_actions));
    assert.strictEqual(res.body.health.ok, true);
  } finally { await cleanup(ctx); }
});

test('GET /api/diagnostics/text returns plain text format', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/diagnostics/text').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/plain'));
    const text = res.text;
    assert.ok(text.includes('TARDINESS APP DIAGNOSTICS'));
    assert.ok(text.includes('SERVER'));
    assert.ok(text.includes('DATABASE'));
    assert.ok(text.includes('BACKUP'));
    assert.ok(text.includes('App version:'));
    assert.ok(text.includes('Node version:'));
    assert.ok(text.includes('Public URL:'));
  } finally { await cleanup(ctx); }
});

function db_setup(db) {
  db.prepare('INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)').run('P1-001', 'Alex', 'Primary 1A');
  const sid = db.prepare('SELECT id FROM students WHERE student_id = ?').get('P1-001').id;
  db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(sid, '2025/2026');
}
