const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { hashPin, generateRecoveryCode } = require('../src/lib/pin');
const { set, get } = require('../src/lib/config');

async function makeAuthedApp(pin = '123456') {
  const db = createDb({ path: ':memory:' });
  const pinHash = await hashPin(pin);
  const code = generateRecoveryCode();
  const codeHash = await (require('../src/lib/pin').hashRecoveryCode(code));
  set(db, 'admin_pin_hash', pinHash);
  set(db, 'recovery_code_hash', codeHash);
  return { app: createApp({ db }), db, pin, recoveryCode: code };
}

// ============ PIN middleware behavior ============

test('POST /api/students without PIN returns 503 when wizard incomplete', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 503);
    assert.ok(res.body.error.includes('wizard'));
  } finally { db.close(); }
});

test('POST /api/students without PIN returns 401 when PIN configured', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.headers['www-authenticate'], 'PIN');
  } finally { db.close(); }
});

test('POST /api/students with correct PIN succeeds', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .set('X-Admin-Pin', pin)
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 201);
  } finally { db.close(); }
});

test('POST /api/students with wrong PIN returns 401', async () => {
  const { app, db } = await makeAuthedApp('123456');
  try {
    const res = await request(app).post('/api/students')
      .set('X-Admin-Pin', '999999')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Invalid PIN');
  } finally { db.close(); }
});

test('POST /api/tardiness does NOT require PIN (fast path)', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    const c = await request(app).post('/api/students')
      .set('X-Admin-Pin', pin)
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).post('/api/tardiness')
      .send({ student_id: c.body.id });
    assert.strictEqual(res.status, 201);
  } finally { db.close(); }
});

test('X-Test-Bypass header skips PIN check (used by other test files)', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .set('X-Test-Bypass', '1')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 201);
  } finally { db.close(); }
});

// ============ /api/config ============

test('GET /api/config returns public fields without PIN', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    set(db, 'school_name', 'Test School');
    set(db, 'academic_year', '2025/2026');
    const app = createApp({ db });
    const res = await request(app).get('/api/config');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.school_name, 'Test School');
    assert.strictEqual(res.body.academic_year, '2025/2026');
    assert.ok(!('has_pin' in res.body));
  } finally { db.close(); }
});

test('GET /api/config/all requires PIN and returns has_pin etc.', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    const res = await request(app).get('/api/config/all').set('X-Admin-Pin', pin);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.has_pin, true);
    assert.strictEqual(res.body.recovery_code_active, true);
  } finally { db.close(); }
});

test('PUT /api/config requires PIN', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    const noAuth = await request(app).put('/api/config').send({ school_name: 'X' });
    assert.strictEqual(noAuth.status, 401);

    const ok = await request(app).put('/api/config')
      .set('X-Admin-Pin', pin)
      .send({ school_name: 'New School' });
    assert.strictEqual(ok.status, 200);
  } finally { db.close(); }
});

test('Setting academic_year via /api/config is reflected in /api/stats', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    await request(app).put('/api/config')
      .set('X-Admin-Pin', pin)
      .send({ academic_year: '2024/2025' });
    const stats = await request(app).get('/api/stats');
    assert.strictEqual(stats.body.academic_year, '2024/2025');
  } finally { db.close(); }
});

// ============ /api/wizard ============

test('Wizard step/school sets school_name (no PIN required)', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/step/school')
      .send({ school_name: 'Elyon Christian Primary School' });
    assert.strictEqual(res.status, 200);
    const cfg = await request(app).get('/api/config');
    assert.strictEqual(cfg.body.school_name, 'Elyon Christian Primary School');
  } finally { db.close(); }
});

test('Wizard step/year validates YYYY/YYYY format', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const bad = await request(app).post('/api/wizard/step/year').send({ academic_year: '2025' });
    assert.strictEqual(bad.status, 400);
    const ok = await request(app).post('/api/wizard/step/year').send({ academic_year: '2025/2026' });
    assert.strictEqual(ok.status, 200);
  } finally { db.close(); }
});

test('Wizard step/pin returns a valid recovery code on success', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/step/pin')
      .send({ pin: '867530', pin_confirm: '867530' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.recovery_code);
    assert.ok(res.body.recovery_code.match(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/));
    assert.ok(res.body.recovery_message.includes('only time'));
  } finally { db.close(); }
});

test('Wizard step/pin rejects weak PIN', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/step/pin')
      .send({ pin: '1234', pin_confirm: '1234' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.errors.some(e => e.includes('weak')));
  } finally { db.close(); }
});

test('Wizard step/pin rejects mismatched confirmation', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/step/pin')
      .send({ pin: '867530', pin_confirm: '867531' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.errors.some(e => e.includes('match')));
  } finally { db.close(); }
});

test('Wizard complete fails if steps missing, succeeds when done', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const incomplete = await request(app).post('/api/wizard/complete');
    assert.strictEqual(incomplete.status, 400);

    await request(app).post('/api/wizard/step/school').send({ school_name: 'S' });
    await request(app).post('/api/wizard/step/year').send({ academic_year: '2025/2026' });
    await request(app).post('/api/wizard/step/pin').send({ pin: '867530', pin_confirm: '867530' });

    const done = await request(app).post('/api/wizard/complete');
    assert.strictEqual(done.status, 200);

    const status = await request(app).get('/api/wizard/status');
    assert.strictEqual(status.body.completed, true);
  } finally { db.close(); }
});

test('Wizard reset-pin uses recovery code to set new PIN', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const setPin = await request(app).post('/api/wizard/step/pin')
      .send({ pin: '867530', pin_confirm: '867530' });
    const code = setPin.body.recovery_code;

    const reset = await request(app).post('/api/wizard/reset-pin')
      .send({ recovery_code: code, pin: '975310', pin_confirm: '975310' });
    assert.strictEqual(reset.status, 200);
    assert.ok(reset.body.recovery_code);
    assert.notStrictEqual(reset.body.recovery_code, code);

    // New PIN works
    const ok = await request(app).post('/api/students')
      .set('X-Admin-Pin', '975310')
      .send({ student_id: 'P1-001', full_name: 'X', class: 'Y' });
    assert.strictEqual(ok.status, 201);

    // Old recovery code is now invalid (new code replaces it)
    const reuse = await request(app).post('/api/wizard/reset-pin')
      .send({ recovery_code: code, pin: '975310', pin_confirm: '975310' });
    assert.strictEqual(reuse.status, 403);
  } finally { db.close(); }
});

test('Wizard reset-pin rejects wrong recovery code with 403', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    await request(app).post('/api/wizard/step/pin').send({ pin: '867530', pin_confirm: '867530' });
    const res = await request(app).post('/api/wizard/reset-pin')
      .send({ recovery_code: 'AAAA-BBBB-CCCC-DDDD', pin: '975310', pin_confirm: '975310' });
    assert.strictEqual(res.status, 403);
  } finally { db.close(); }
});

// ============ Audit log writes happen ============

test('Wizard actions write to audit_log', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    await request(app).post('/api/wizard/step/school').send({ school_name: 'S' });
    await request(app).post('/api/wizard/step/year').send({ academic_year: '2025/2026' });
    await request(app).post('/api/wizard/step/pin').send({ pin: '867530', pin_confirm: '867530' });
    await request(app).post('/api/wizard/complete');

    const rows = db.prepare("SELECT action FROM audit_log ORDER BY id").all();
    const actions = rows.map(r => r.action);
    assert.ok(actions.includes('wizard.set_school'));
    assert.ok(actions.includes('wizard.set_year'));
    assert.ok(actions.includes('wizard.set_pin'));
    assert.ok(actions.includes('wizard.completed'));
  } finally { db.close(); }
});
