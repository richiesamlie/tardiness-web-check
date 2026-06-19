const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { getCurrentAcademicYear } = require('../src/lib/year');
const { getTodayUtc } = require('../src/lib/time');

function makeApp() {
  const db = createDb({ path: ':memory:' });
  return { app: createApp({ db }), db };
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex Tan', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students').send(payload);
  return res.body;
}

// ===== POST /api/tardiness =====

test('POST /api/tardiness marks an existing student late and returns 201 + joined info', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    const res = await request(app).post('/api/tardiness')
      .send({ student_id: s.id, recorded_by: 'Gate Tablet' });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id > 0);
    assert.strictEqual(res.body.student_id, s.id);
    assert.strictEqual(res.body.school_id, 'P1-001');
    assert.strictEqual(res.body.full_name, 'Alex Tan');
    assert.strictEqual(res.body.class, 'Primary 1A');
    assert.strictEqual(res.body.academic_year, getCurrentAcademicYear());
    assert.strictEqual(res.body.recorded_by, 'Gate Tablet');
    assert.ok(res.body.occurred_at);
    assert.strictEqual(res.body.notes, null);
  } finally { db.close(); }
});

test('POST /api/tardiness returns 400 if student_id missing/invalid', async () => {
  const { app, db } = makeApp();
  try {
    let res = await request(app).post('/api/tardiness').send({});
    assert.strictEqual(res.status, 400);
    res = await request(app).post('/api/tardiness').send({ student_id: 'abc' });
    assert.strictEqual(res.status, 400);
  } finally { db.close(); }
});

test('POST /api/tardiness returns 404 if student does not exist or is inactive', async () => {
  const { app, db } = makeApp();
  try {
    let res = await request(app).post('/api/tardiness').send({ student_id: 9999 });
    assert.strictEqual(res.status, 404);

    const s = await createStudent(app);
    await request(app).delete(`/api/students/${s.id}`);
    res = await request(app).post('/api/tardiness').send({ student_id: s.id });
    assert.strictEqual(res.status, 404);
  } finally { db.close(); }
});

test('POST /api/tardiness accepts notes and custom occurred_at (ISO 8601)', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    const res = await request(app).post('/api/tardiness').send({
      student_id: s.id,
      notes: 'traffic',
      occurred_at: '2026-06-19T07:42:00Z',
    });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.notes, 'traffic');
    assert.ok(res.body.occurred_at.startsWith('2026-06-19'));
  } finally { db.close(); }
});

// ===== GET /api/tardiness =====

test('GET /api/tardiness lists events with joined student info, newest first', async () => {
  const { app, db } = makeApp();
  try {
    const s1 = await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const s2 = await createStudent(app, { student_id: 'P1-002', full_name: 'Brian', class: 'Primary 1A' });
    await request(app).post('/api/tardiness').send({ student_id: s1.id, occurred_at: '2026-06-19T07:00:00Z' });
    await request(app).post('/api/tardiness').send({ student_id: s2.id, occurred_at: '2026-06-19T08:00:00Z' });

    const res = await request(app).get('/api/tardiness');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 2);
    assert.strictEqual(res.body.items.length, 2);
    assert.strictEqual(res.body.items[0].full_name, 'Brian');  // newest
    assert.strictEqual(res.body.items[1].full_name, 'Alex');
  } finally { db.close(); }
});

test('GET /api/tardiness?date=YYYY-MM-DD filters by UTC date', async () => {
  const { app, db } = makeApp();
  try {
    const s = await createStudent(app);
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: '2026-06-19T07:00:00Z' });
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: '2026-06-18T07:00:00Z' });

    let res = await request(app).get('/api/tardiness?date=2026-06-19');
    assert.strictEqual(res.body.total, 1);
    res = await request(app).get('/api/tardiness?date=2026-06-18');
    assert.strictEqual(res.body.total, 1);
    res = await request(app).get('/api/tardiness?date=2026-06-20');
    assert.strictEqual(res.body.total, 0);
  } finally { db.close(); }
});

test('GET /api/tardiness?class= filters by student class', async () => {
  const { app, db } = makeApp();
  try {
    const s1 = await createStudent(app, { student_id: 'P1-001', class: 'Primary 1A' });
    const s2 = await createStudent(app, { student_id: 'P2-001', class: 'Primary 2A' });
    await request(app).post('/api/tardiness').send({ student_id: s1.id });
    await request(app).post('/api/tardiness').send({ student_id: s2.id });

    const res = await request(app).get('/api/tardiness?class=Primary%201A');
    assert.strictEqual(res.body.total, 1);
    assert.strictEqual(res.body.items[0].class, 'Primary 1A');
  } finally { db.close(); }
});

// ===== GET /api/tardiness/today =====

test('GET /api/tardiness/today returns only today\'s events (UTC)', async () => {
  const { app, db } = makeApp();
  try {
    const today = getTodayUtc();
    const s = await createStudent(app);
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: `${today}T07:00:00Z` });
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: '2020-01-01T07:00:00Z' });

    const res = await request(app).get('/api/tardiness/today');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total, 1);
    assert.ok(res.body.items[0].occurred_at.startsWith(today));
  } finally { db.close(); }
});

// ===== GET /api/stats =====

test('GET /api/stats returns totals + per-class breakdown', async () => {
  const { app, db } = makeApp();
  try {
    const s1 = await createStudent(app, { student_id: 'P1-001', class: 'Primary 1A' });
    const s2 = await createStudent(app, { student_id: 'P1-002', class: 'Primary 1A' });
    const s3 = await createStudent(app, { student_id: 'P2-001', class: 'Primary 2A' });
    await createStudent(app, { student_id: 'P9-001', class: 'Primary 9A' });  // no events

    const year = getCurrentAcademicYear();
    for (let i = 0; i < 3; i++) db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s1.id, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s2.id, year);
    for (let i = 0; i < 2; i++) db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s3.id, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s1.id, '2020/2021');  // different year, should NOT count

    const res = await request(app).get('/api/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.academic_year, year);
    assert.strictEqual(res.body.total_active_students, 4);
    assert.strictEqual(res.body.total_events_this_year, 6);

    const byClass = Object.fromEntries(res.body.per_class.map(c => [c.class, c]));
    assert.strictEqual(byClass['Primary 1A'].student_count, 2);
    assert.strictEqual(byClass['Primary 1A'].event_count, 4);
    assert.strictEqual(byClass['Primary 1A'].avg_lates_per_student, 2);
    assert.strictEqual(byClass['Primary 2A'].student_count, 1);
    assert.strictEqual(byClass['Primary 2A'].event_count, 2);
    assert.strictEqual(byClass['Primary 2A'].avg_lates_per_student, 2);
  } finally { db.close(); }
});
