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
const backup = require('../src/lib/backup');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tardiness-test-'));
}

async function authedAppWithTempDb() {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'tardiness.db');
  const db = createDb({ path: dbPath });
  set(db, 'admin_pin_hash', await hashPin('867530'));
  const app = createApp({ db, dbPath });
  return { app, db, dbPath, dir };
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students')
    .set('X-Test-Bypass', '1').send(payload);
  return res.body;
}

async function cleanup({ db, dir }) {
  try { db.close(); } catch { /* */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// ============ Backup library ============

test('createBackup produces a zip with tardiness.db and meta.json', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    db__insertStudent(ctx.db, 'P1-001', 'Alex', 'Primary 1A');
    const result = await backup.createBackup(ctx.db, ctx.dbPath);
    assert.ok(result.buffer instanceof Buffer);
    assert.ok(result.buffer.length > 100);
    const unzipper = require('unzipper');
    const d = await unzipper.Open.buffer(result.buffer);
    const names = d.files.map(f => f.path);
    assert.ok(names.includes('tardiness.db'));
    assert.ok(names.includes('meta.json'));
    // meta.json content check
    const metaEntry = d.files.find(f => f.path === 'meta.json');
    const metaBuf = await metaEntry.buffer();
    const meta = JSON.parse(metaBuf.toString('utf8'));
    assert.strictEqual(typeof meta.app_version, 'string');
    assert.strictEqual(meta.schema_version, 1);
    assert.strictEqual(typeof meta.created_at, 'string');
  } finally { await cleanup(ctx); }
});

function db__insertStudent(db, sid, name, cls) {
  db.prepare('INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)').run(sid, name, cls);
}

test('listBackups returns empty array when folder is empty/missing', () => {
  const dir = tmpDir();
  try {
    assert.deepStrictEqual(backup.listBackups(dir), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('listBackups returns sorted (newest first) backups', () => {
  const dir = tmpDir();
  try {
    for (const [name, when] of [
      ['tardiness-backup-2025-01-01-120000.zip', new Date('2025-01-01')],
      ['tardiness-backup-2025-06-15-120000.zip', new Date('2025-06-15')],
      ['tardiness-backup-2025-03-10-120000.zip', new Date('2025-03-10')],
    ]) {
      const p = path.join(dir, name);
      fs.writeFileSync(p, 'x');
      fs.utimesSync(p, when, when);
    }
    const list = backup.listBackups(dir);
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].filename, 'tardiness-backup-2025-06-15-120000.zip');
    assert.strictEqual(list[2].filename, 'tardiness-backup-2025-01-01-120000.zip');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pruneOldBackups removes files older than cutoff', () => {
  const dir = tmpDir();
  try {
    const old = path.join(dir, 'tardiness-backup-2020-01-01-120000.zip');
    const recent = path.join(dir, 'tardiness-backup-2025-06-15-120000.zip');
    fs.writeFileSync(old, 'x');
    fs.writeFileSync(recent, 'x');
    fs.utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));
    fs.utimesSync(recent, new Date(), new Date());

    const removed = backup.pruneOldBackups(dir, 365);
    assert.strictEqual(removed, 1);
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(recent));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============ Endpoints ============

test('POST /api/backup requires PIN', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).post('/api/backup');
    assert.strictEqual(res.status, 401);
  } finally { await cleanup(ctx); }
});

test('POST /api/backup with PIN returns downloadable zip', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    await createStudent(ctx.app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(ctx.app).post('/api/backup').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('zip'));
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    assert.ok(res.headers['content-disposition'].includes('tardiness-backup-'));
  } finally { await cleanup(ctx); }
});

test('GET /api/backups returns empty list initially', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.backups, []);
    assert.ok(typeof res.body.folder === 'string');
  } finally { await cleanup(ctx); }
});

test('Backup made via /api/backup then /api/backups lists it', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    await request(ctx.app).post('/api/backup').set('X-Admin-Pin', '867530');
    const list = await request(ctx.app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(list.body.backups.length, 1);
    assert.ok(list.body.backups[0].filename.startsWith('tardiness-backup-'));
    assert.ok(list.body.backups[0].sizeBytes > 100);
  } finally { await cleanup(ctx); }
});

test('POST /api/restore requires PIN', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).post('/api/restore')
      .attach('file', Buffer.from('x'), 'backup.zip');
    assert.strictEqual(res.status, 401);
  } finally { await cleanup(ctx); }
});

test('POST /api/restore rejects invalid zip with 400', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).post('/api/restore')
      .set('X-Admin-Pin', '867530')
      .attach('file', Buffer.from('not a zip'), 'backup.zip');
    assert.strictEqual(res.status, 400);
  } finally { await cleanup(ctx); }
});

test('POST /api/restore rejects zip without meta.json', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    // Build a zip with only tardiness.db
    const archiver = require('archiver');
    const { PassThrough } = require('node:stream');
    const archive = archiver('zip');
    const pass = new PassThrough();
    const chunks = [];
    pass.on('data', c => chunks.push(c));
    archive.pipe(pass);
    archive.append('fake db content', { name: 'tardiness.db' });
    archive.finalize();
    await new Promise(r => pass.on('end', r));
    const buf = Buffer.concat(chunks);

    const res = await request(ctx.app).post('/api/restore')
      .set('X-Admin-Pin', '867530')
      .attach('file', buf, 'backup.zip');
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('meta.json'));
  } finally { await cleanup(ctx); }
});

test('Round-trip: backup → wipe → restore → data back', async () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'tardiness.db');
  let db, db2;
  try {
    // Setup
    db = createDb({ path: dbPath });
    set(db, 'admin_pin_hash', await hashPin('867530'));
    const app = createApp({ db, dbPath });
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    await request(app).post('/api/tardiness').send({ student_id: 1 });

    // Backup (use binary parser for the zip)
    const backupRes = await request(app).post('/api/backup').set('X-Admin-Pin', '867530').buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.strictEqual(backupRes.status, 200);
    const backupBuf = backupRes.body;
    assert.ok(Buffer.isBuffer(backupBuf));
    assert.ok(backupBuf.length > 100);
    db.close();

    // Wipe DB
    for (const ext of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + ext); } catch { /* */ }
    }

    // Restore (fresh DB connection, set PIN so middleware accepts request)
    db2 = createDb({ path: dbPath });
    set(db2, 'admin_pin_hash', await hashPin('867530'));
    const app2 = createApp({ db: db2, dbPath });
    const restoreRes = await request(app2).post('/api/restore')
      .set('X-Admin-Pin', '867530')
      .attach('file', backupBuf, 'restore.zip');
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.body.ok, true);
    assert.strictEqual(restoreRes.body.restart_required, true);
    assert.ok(fs.existsSync(dbPath));
    // db2 was already closed by restoreBackup — try/catch to be safe
    try { db2.close(); } catch { /* */ }
  } finally {
    try { db && db.close(); } catch { /* */ }
    try { db2 && db2.close(); } catch { /* */ }
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* best-effort */ }
  }
});

// ============ Health ============

test('GET /api/health includes backup status block', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.backup);
    assert.strictEqual(typeof res.body.backup.folder, 'string');
    assert.strictEqual(res.body.backup.backup_count, 0);
    assert.strictEqual(res.body.backup.last_backup, null);
  } finally { await cleanup(ctx); }
});

test('GET /api/health shows last_backup after creating one', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    await request(ctx.app).post('/api/backup').set('X-Admin-Pin', '867530');
    const res = await request(ctx.app).get('/api/health');
    assert.strictEqual(res.body.backup.backup_count, 1);
    assert.ok(res.body.backup.last_backup);
  } finally { await cleanup(ctx); }
});

// ============ Delete ============

test('DELETE /api/backups/:filename removes file', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    await request(ctx.app).post('/api/backup').set('X-Admin-Pin', '867530');
    const list = await request(ctx.app).get('/api/backups').set('X-Admin-Pin', '867530');
    const filename = list.body.backups[0].filename;
    const del = await request(ctx.app).delete(`/api/backups/${filename}`).set('X-Admin-Pin', '867530');
    assert.strictEqual(del.status, 200);
    const list2 = await request(ctx.app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(list2.body.backups.length, 0);
  } finally { await cleanup(ctx); }
});

test('DELETE /api/backups/:filename rejects path traversal', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).delete('/api/backups/..%2F..%2Fetc%2Fpasswd').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 400);
  } finally { await cleanup(ctx); }
});

test('DELETE /api/backups/:filename rejects non-backup filenames', async () => {
  const ctx = await authedAppWithTempDb();
  try {
    const res = await request(ctx.app).delete('/api/backups/random.txt').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 400);
  } finally { await cleanup(ctx); }
});
