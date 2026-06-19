const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const XLSX = require('xlsx');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

function makeApp() {
  const db = createDb({ path: ':memory:' });
  return { app: createApp({ db }), db };
}

// Supertest's default parser mangles binary (UTF-8 decodes BOM bytes into chars).
// Use a raw parser for binary endpoints (XLSX, CSV).
function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function getBinary(requestPromise) {
  const res = await requestPromise.parse(binaryParser);
  return res.body;
}

function getBody(res) {
  // For binary responses, supertest leaves res.body empty — use res.text
  if (Buffer.isBuffer(res.body)) return res.body;
  if (res.body && typeof res.body === 'object' && Object.keys(res.body).length > 0) return res.body;
  if (res.text !== undefined) return Buffer.from(res.text, 'binary');
  return res.body;
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students')
    .set('X-Test-Bypass', '1').send(payload);
  return res.body;
}

function buildXlsxBuffer(rows) {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, 'Students');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ============ Template ============

test('GET /api/template?format=xlsx returns XLSX (PK magic bytes)', async () => {
  const { app } = makeApp();
  const buf = await getBinary(request(app).get('/api/template?format=xlsx'));
  assert.strictEqual(buf[0], 0x50);  // 'P'
  assert.strictEqual(buf[1], 0x4B);  // 'K'
});

test('GET /api/template?format=csv returns CSV with UTF-8 BOM', async () => {
  const { app } = makeApp();
  const buf = await getBinary(request(app).get('/api/template?format=csv'));
  assert.strictEqual(buf[0], 0xEF);
  assert.strictEqual(buf[1], 0xBB);
  assert.strictEqual(buf[2], 0xBF);
  const text = buf.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.startsWith('student_id,full_name,class'));
});

test('GET /api/template?format=invalid returns 400', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/template?format=pdf');
  assert.strictEqual(res.status, 400);
});

test('GET /api/template defaults to xlsx when no format given', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/template');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('spreadsheet'));
});

// ============ Export ============

test('GET /api/export?scope=students&format=xlsx returns XLSX', async () => {
  const { app } = makeApp();
  await createStudent(app);
  const res = await request(app).get('/api/export?scope=students&format=xlsx');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('spreadsheet'));
});

test('GET /api/export?scope=students&format=csv includes student data + late_count column', async () => {
  const { app } = makeApp();
  await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
  const buf = await getBinary(request(app).get('/api/export?scope=students&format=csv'));
  const text = buf.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.includes('student_id,full_name,class,late_count,active'));
  assert.ok(text.includes('P1-001,Alex,Primary 1A'));
});

test('GET /api/export?scope=tardiness includes events', async () => {
  const { app } = makeApp();
  const s = await createStudent(app);
  await request(app).post('/api/tardiness').send({ student_id: s.id, notes: 'traffic' });
  const buf = await getBinary(request(app).get('/api/export?scope=tardiness&format=csv'));
  const text = buf.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.includes('occurred_at'));
  assert.ok(text.includes('traffic'));
});

test('GET /api/export?scope=invalid returns 400', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/export?scope=foo');
  assert.strictEqual(res.status, 400);
});

// ============ Import preview ============

test('POST /api/import/preview requires PIN (503 if no PIN, 401 if wrong)', async () => {
  // Case 1: no PIN configured → 503
  let { app, db } = makeApp();
  try {
    const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A';
    const res = await request(app).post('/api/import/preview')
      .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
    assert.strictEqual(res.status, 503);
  } finally { db.close(); }

  // Case 2: PIN configured but wrong header → 401
  ({ app, db } = await (async () => {
    const d = createDb({ path: ':memory:' });
    const { set } = require('../src/lib/config');
    const { hashPin } = require('../src/lib/pin');
    set(d, 'admin_pin_hash', await hashPin('867530'));
    return { app: createApp({ db: d }), db: d };
  })());
  try {
    const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A';
    const res = await request(app).post('/api/import/preview')
      .set('X-Admin-Pin', 'wrong')
      .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
    assert.strictEqual(res.status, 401);
  } finally { db.close(); }
});

test('POST /api/import/preview returns summary for new CSV upload', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A\nP1-002,Brian,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.format, 'csv');
  assert.strictEqual(res.body.summary.new_count, 2);
  assert.strictEqual(res.body.summary.update_count, 0);
  assert.strictEqual(res.body.summary.error_count, 0);
  assert.strictEqual(res.body.new_students.length, 2);
});

test('POST /api/import/preview detects updates vs new vs unchanged', async () => {
  const { app } = makeApp();
  await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
  await createStudent(app, { student_id: 'P1-002', full_name: 'Brian', class: 'Primary 1A' });
  const csv = 'student_id,full_name,class\nP1-001,Alexandra,Primary 1B\nP1-002,Brian,Primary 1A\nP1-003,Cindy,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.new_count, 1);   // P1-003
  assert.strictEqual(res.body.summary.update_count, 1); // P1-001 changed
  assert.strictEqual(res.body.summary.error_count, 0);
  assert.strictEqual(res.body.updated_students[0].student_id, 'P1-001');
  assert.strictEqual(res.body.updated_students[0].old_full_name, 'Alex');
  assert.strictEqual(res.body.updated_students[0].new_full_name, 'Alexandra');
  // P1-002 unchanged — silent
});

test('POST /api/import/preview reports errors for missing fields', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,,Primary 1A\nP1-002,Brian,\n,Charlie,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.error_count, 3);
  const reasons = res.body.errors.map(e => e.reason);
  assert.ok(reasons.some(r => r.includes('full_name')));
  assert.ok(reasons.some(r => r.includes('class')));
  assert.ok(reasons.some(r => r.includes('student_id')));
});

test('POST /api/import/preview detects duplicate student_id within file', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A\nP1-001,Other,Primary 1B';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.error_count, 1);
  assert.ok(res.body.errors[0].reason.includes('duplicate'));
});

test('POST /api/import/preview accepts XLSX upload', async () => {
  const { app } = makeApp();
  const buf = buildXlsxBuffer([
    ['student_id', 'full_name', 'class'],
    ['P1-001', 'Alex', 'Primary 1A'],
    ['P1-002', 'Brian', 'Primary 1A'],
  ]);
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', buf, 'students.xlsx');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.format, 'xlsx');
  assert.strictEqual(res.body.summary.new_count, 2);
});

test('POST /api/import/preview rejects unsupported format with 400', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from('not a spreadsheet'), 'foo.txt');
  assert.strictEqual(res.status, 400);
});

test('POST /api/import/preview rejects empty/missing file', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1');
  assert.strictEqual(res.status, 400);
});

// ============ Import commit ============

test('POST /api/import/commit requires PIN (503 if no PIN, 401 if wrong)', async () => {
  // Case 1: no PIN → 503
  let { app, db } = makeApp();
  try {
    const res = await request(app).post('/api/import/commit').send({ rows: [] });
    assert.strictEqual(res.status, 503);
  } finally { db.close(); }

  // Case 2: PIN configured but wrong → 401
  ({ app, db } = await (async () => {
    const d = createDb({ path: ':memory:' });
    const { set } = require('../src/lib/config');
    const { hashPin } = require('../src/lib/pin');
    set(d, 'admin_pin_hash', await hashPin('867530'));
    return { app: createApp({ db: d }), db: d };
  })());
  try {
    const res = await request(app).post('/api/import/commit')
      .set('X-Admin-Pin', 'wrong')
      .send({ rows: [{ student_id: 'X', full_name: 'Y', class: 'Z' }] });
    assert.strictEqual(res.status, 401);
  } finally { db.close(); }
});

test('POST /api/import/commit adds new students and returns applied counts', async () => {
  const { app, db } = makeApp();
  try {
    const rows = [
      { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' },
      { student_id: 'P1-002', full_name: 'Brian', class: 'Primary 1A' },
    ];
    const res = await request(app).post('/api/import/commit')
      .set('X-Test-Bypass', '1')
      .send({ rows });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.added, 2);
    assert.strictEqual(res.body.updated, 0);
    const list = await request(app).get('/api/students');
    assert.strictEqual(list.body.total, 2);
  } finally { db.close(); }
});

test('POST /api/import/commit updates existing students', async () => {
  const { app } = makeApp();
  await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
  const res = await request(app).post('/api/import/commit')
    .set('X-Test-Bypass', '1')
    .send({ rows: [{ student_id: 'P1-001', full_name: 'Alexandra', class: 'Primary 1B' }] });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.updated, 1);
  const get = await request(app).get('/api/students/1');
  assert.strictEqual(get.body.full_name, 'Alexandra');
  assert.strictEqual(get.body.class, 'Primary 1B');
});

test('POST /api/import/commit skips invalid rows in payload', async () => {
  const { app, db } = makeApp();
  try {
    const rows = [
      { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' },
      { student_id: '', full_name: 'X', class: 'Y' },
      { student_id: 'P1-002' },
    ];
    const res = await request(app).post('/api/import/commit')
      .set('X-Test-Bypass', '1')
      .send({ rows });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.added, 1);
    assert.strictEqual(res.body.skipped, 2);
  } finally { db.close(); }
});

test('POST /api/import/commit rejects empty rows array', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/import/commit')
    .set('X-Test-Bypass', '1')
    .send({ rows: [] });
  assert.strictEqual(res.status, 400);
});

// ============ End-to-end round-trip ============

test('Round-trip: download template → upload → preview → commit', async () => {
  const { app, db } = makeApp();
  try {
    // 1. Download template
    const tpl = await request(app).get('/api/template?format=csv');
    assert.strictEqual(tpl.status, 200);

    // 2. Build a filled CSV (simulating admin fill-in)
    const filled = 'student_id,full_name,class\nP1-001,Alex Tan,Primary 1A\nP1-002,Brian Lee,Primary 1A';

    // 3. Preview
    const prev = await request(app).post('/api/import/preview')
      .set('X-Test-Bypass', '1')
      .attach('file', Buffer.from(filled, 'utf8'), 'filled.csv');
    assert.strictEqual(prev.status, 200);
    assert.strictEqual(prev.body.summary.new_count, 2);

    // 4. Commit (client sends back the rows to apply)
    const commit = await request(app).post('/api/import/commit')
      .set('X-Test-Bypass', '1')
      .send({ rows: prev.body.new_students });
    assert.strictEqual(commit.status, 200);
    assert.strictEqual(commit.body.added, 2);

    // 5. Verify export contains them
    const buf = await getBinary(request(app).get('/api/export?scope=students&format=csv'));
    const text = buf.toString('utf8').replace(/^\ufeff/, '');
    assert.ok(text.includes('P1-001,Alex Tan,Primary 1A'));
    assert.ok(text.includes('P1-002,Brian Lee,Primary 1A'));
  } finally { db.close(); }
});
