const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { getCurrentAcademicYear } = require('../src/lib/year');

function makeApp() {
  const db = createDb({ path: ':memory:' });
  return { app: createApp({ db }), db };
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex Tan', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students').send(payload);
  return res.body;
}

// ============ GET /api/students ============

test('GET /api/students returns { items: [], total: 0 } when empty', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).get('/api/students');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { items: [], total: 0, page: 1, limit: 50 });
  } finally { db.close(); }
});

test('GET /api/students returns active students sorted by class then name', async () => {
  const { app, db } = makeApp();
  try {
    await createStudent(app, { student_id: 'P1-001', full_name: 'Zara', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P1-002', full_name: 'Alex', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P2-001', full_name: 'Brian', class: 'Primary 2A' });

    const res = await request(app).get('/api/students');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 3);
    assert.strictEqual(res.body.items.length, 3);
    assert.strictEqual(res.body.items[0].full_name, 'Alex');
    assert.strictEqual(res.body.items[1].full_name, 'Zara');
    assert.strictEqual(res.body.items[2].full_name, 'Brian');
  } finally { db.close(); }
});

test('GET /api/students?search= matches name OR student_id (case-insensitive)', async () => {
  const { app, db } = makeApp();
  try {
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex Tan', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P1-002', full_name: 'Brian Lee', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P5-099', full_name: 'Alexandra Wu', class: 'Primary 5A' });

    let res = await request(app).get('/api/students?search=alex');
    assert.strictEqual(res.body.total, 2);

    res = await request(app).get('/api/students?search=P1');
    assert.strictEqual(res.body.total, 2);

    res = await request(app).get('/api/students?search=NONEXISTENT');
    assert.strictEqual(res.body.total, 0);
  } finally { db.close(); }
});

test('GET /api/students?class= filters by exact class', async () => {
  const { app, db } = makeApp();
  try {
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P1-002', full_name: 'Brian', class: 'Primary 1A' });
    await createStudent(app, { student_id: 'P2-001', full_name: 'Cindy', class: 'Primary 2A' });

    const res = await request(app).get('/api/students?class=Primary%201A');
    assert.strictEqual(res.body.total, 2);
  } finally { db.close(); }
});

test('GET /api/students excludes inactive by default; includeInactive=1 shows them', async () => {
  const { app, db } = makeApp();
  try {
    const s1 = await createStudent(app, { student_id: 'P1-001', full_name: 'Active', class: 'Primary 1A' });
    const s2 = await createStudent(app, { student_id: 'P1-002', full_name: 'Inactive', class: 'Primary 1A' });
    await request(app).delete(`/api/students/${s2.id}`);

    const def = await request(app).get('/api/students');
    assert.strictEqual(def.body.total, 1);

    const all = await request(app).get('/api/students?includeInactive=1');
    assert.strictEqual(all.body.total, 2);
  } finally { db.close(); }
});

// ============ POST /api/students ============

test('POST /api/students creates a student and returns 201 + body', async () => {
  const { app, db } = makeApp();
  try {
    const payload = { student_id: 'P1-001', full_name: 'Alex Tan', class: 'Primary 1A' };
    const res = await request(app).post('/api/students').send(payload);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.student_id, 'P1-001');
    assert.strictEqual(res.body.full_name, 'Alex Tan');
    assert.strictEqual(res.body.class, 'Primary 1A');
    assert.strictEqual(res.body.active, 1);
    assert.ok(res.body.id > 0);
  } finally { db.close(); }
});

test('POST /api/students returns 400 with plain-English errors when fields missing', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).post('/api/students').send({ student_id: 'P1-001' });
    assert.strictEqual(res.status, 400);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.some(e => e.includes('full_name')));
    assert.ok(res.body.errors.some(e => e.includes('class')));
  } finally { db.close(); }
});

test('POST /api/students returns 409 on duplicate student_id', async () => {
  const { app, db } = makeApp();
  try {
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Other', class: 'Primary 1B' });
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.errors[0].includes('P1-001'));
  } finally { db.close(); }
});

// ============ GET /api/students/:id ============

test('GET /api/students/:id returns 404 for unknown id', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).get('/api/students/9999');
    assert.strictEqual(res.status, 404);
    assert.ok(res.body.error);
  } finally { db.close(); }
});

test('GET /api/students/:id returns student + late_count (current year only)', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    const year = getCurrentAcademicYear();
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s.id, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s.id, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s.id, '2020/2021');  // different year, should not count

    const res = await request(app).get(`/api/students/${s.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, s.id);
    assert.strictEqual(res.body.late_count, 2);
  } finally { db.close(); }
});

// ============ PUT /api/students/:id ============

test('PUT /api/students/:id updates name and class', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    const res = await request(app).put(`/api/students/${s.id}`)
      .send({ full_name: 'Alexandra Tan', class: 'Primary 1B' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.full_name, 'Alexandra Tan');
    assert.strictEqual(res.body.class, 'Primary 1B');
    assert.strictEqual(res.body.student_id, 'P1-001');  // unchanged
  } finally { db.close(); }
});

test('PUT /api/students/:id returns 404 for unknown id', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).put('/api/students/9999').send({ full_name: 'X' });
    assert.strictEqual(res.status, 404);
  } finally { db.close(); }
});

// ============ DELETE /api/students/:id ============

test('DELETE /api/students/:id soft-deletes (sets active=0, row preserved)', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    const res = await request(app).delete(`/api/students/${s.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(s.id);
    assert.strictEqual(row.active, 0);
  } finally { db.close(); }
});

test('DELETE /api/students/:id returns 404 for unknown id', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).delete('/api/students/9999');
    assert.strictEqual(res.status, 404);
  } finally { db.close(); }
});
