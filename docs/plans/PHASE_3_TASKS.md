## 🎯 Phase 3 — Tardiness Events API (DETAILED)

**Outcome:** Full REST API for tardiness events — mark late, list with filters, "today" view, aggregate stats.

### Endpoints

| Method | Path | Behavior | Auth |
|---|---|---|---|
| POST | `/api/tardiness` | Mark a student late | none (fast path, no PIN) |
| GET | `/api/tardiness?date=&class=&schoolId=&page=&limit=` | List events with filters | none |
| GET | `/api/tardiness/today` | All events from today (UTC) | none |
| GET | `/api/stats` | Aggregate counts per class + totals | none |

### Time conventions
- All timestamps stored as UTC (`datetime('now')` in SQLite)
- "Today" = current UTC date (`YYYY-MM-DD`)
- `date` filter accepts `YYYY-MM-DD`
- `occurred_at` may be passed as ISO 8601 or omitted (defaults to NOW)
- documented in `src/lib/time.js`

### Event response shape (joined with student)
```js
{
  id: 1,                    // event id
  student_id: 5,            // internal db id
  school_id: "P1-001",      // student's school id
  full_name: "Alex Tan",
  class: "Primary 1A",
  occurred_at: "2026-06-19 07:42:11",
  academic_year: "2025/2026",
  recorded_by: "Gate Tablet",
  notes: "traffic"
}
```

---

### Task 3.1 — `src/lib/time.js` helper

**Files:** Create `src/lib/time.js`

```js
function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function toSqliteTimestamp(input) {
  // Accept ISO 8601 or undefined; return SQLite-friendly 'YYYY-MM-DD HH:MM:SS' UTC string
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { getTodayUtc, toSqliteTimestamp };
```

Commit: `chore: add time helper (UTC date + ISO conversion)`

---

### Task 3.2 — Failing test: POST marks student late

**Files:** Create `test/tardiness.test.js`

```js
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

test('POST /api/tardiness marks an existing student late and returns 201', async () => {
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
```

Run: FAIL (404, no route). Commit.

---

### Task 3.3 — Implement POST /api/tardiness

**Files:** Create `src/routes/tardiness.js`, modify `src/app.js`

**`src/routes/tardiness.js`:**
```js
const express = require('express');
const router = express.Router();
const { getCurrentAcademicYear } = require('../lib/year');
const { toSqliteTimestamp } = require('../lib/time');

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { student_id, notes, recorded_by, occurred_at } = req.body || {};
  const sid = parseInt(student_id, 10);
  if (!Number.isInteger(sid) || sid <= 0) {
    return res.status(400).json({ errors: ['student_id (numeric) is required'] });
  }
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND active = 1').get(sid);
  if (!student) {
    return res.status(404).json({ errors: [`student id ${sid} not found or inactive`] });
  }

  const ts = occurred_at ? toSqliteTimestamp(occurred_at) : null;
  if (occurred_at && !ts) {
    return res.status(400).json({ errors: ['occurred_at must be a valid ISO 8601 timestamp'] });
  }

  const year = getCurrentAcademicYear();
  const info = db.prepare(`
    INSERT INTO tardiness_events (student_id, occurred_at, academic_year, recorded_by, notes)
    VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)
  `).run(sid, ts, year, recorded_by || null, notes || null);

  const row = db.prepare(`
    SELECT e.id, e.student_id, s.student_id AS school_id, s.full_name, s.class,
           e.occurred_at, e.academic_year, e.recorded_by, e.notes
    FROM tardiness_events e JOIN students s ON s.id = e.student_id
    WHERE e.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(row);
});

module.exports = router;
```

**`src/app.js`** — add mount:
```js
const tardinessRouter = require('./routes/tardiness');
// ...
app.use('/api/tardiness', tardinessRouter);
```

Run: PASS. Commit.

---

### Task 3.4 — Validation tests for POST

Append to `test/tardiness.test.js`:

```js
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

test('POST /api/tardiness accepts notes and custom occurred_at', async () => {
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
```

Run: PASS (already covered by Task 3.3). Commit.

---

### Task 3.5 — Failing tests: GET /api/tardiness list + filters

Append to `test/tardiness.test.js`:

```js
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
    // Newest first
    assert.strictEqual(res.body.items[0].full_name, 'Brian');
    assert.strictEqual(res.body.items[1].full_name, 'Alex');
  } finally { db.close(); }
});

test('GET /api/tardiness?date=YYYY-MM-DD filters by date', async () => {
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
```

Run: FAIL (404). Commit.

---

### Task 3.6 — Implement GET /api/tardiness with filters

Append to `src/routes/tardiness.js`:

```js
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const date = (req.query.date || '').trim();
  const classFilter = (req.query.class || '').trim();
  const schoolId = (req.query.schoolId || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const where = ['1=1'];
  const params = [];
  if (date) { where.push('substr(e.occurred_at, 1, 10) = ?'); params.push(date); }
  if (classFilter) { where.push('s.class = ?'); params.push(classFilter); }
  if (schoolId) { where.push('s.student_id = ?'); params.push(schoolId); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM tardiness_events e
    JOIN students s ON s.id = e.student_id
    ${whereSql}
  `).get(...params).n;

  const items = db.prepare(`
    SELECT e.id, e.student_id, s.student_id AS school_id, s.full_name, s.class,
           e.occurred_at, e.academic_year, e.recorded_by, e.notes
    FROM tardiness_events e JOIN students s ON s.id = e.student_id
    ${whereSql}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ items, total, page, limit });
});
```

Run: PASS. Commit.

---

### Task 3.7 — Test + implement GET /api/tardiness/today

Append test:

```js
test('GET /api/tardiness/today returns only today\'s events (UTC)', async () => {
  const { app, db } = makeApp();
  try {
    const { getTodayUtc } = require('../src/lib/time');
    const today = getTodayUtc();
    const s = await createStudent(app);
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: `${today}T07:00:00Z` });
    await request(app).post('/api/tardiness').send({ student_id: s.id, occurred_at: `2020-01-01T07:00:00Z` });

    const res = await request(app).get('/api/tardiness/today');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.items.length, 1);
    assert.ok(res.body.items[0].occurred_at.startsWith(today));
  } finally { db.close(); }
});
```

Append route:

```js
const { getTodayUtc } = require('../lib/time');

router.get('/today', (req, res) => {
  const db = req.app.locals.db;
  const today = getTodayUtc();
  const items = db.prepare(`
    SELECT e.id, e.student_id, s.student_id AS school_id, s.full_name, s.class,
           e.occurred_at, e.academic_year, e.recorded_by, e.notes
    FROM tardiness_events e JOIN students s ON s.id = e.student_id
    WHERE substr(e.occurred_at, 1, 10) = ?
    ORDER BY e.occurred_at ASC
  `).all(today);
  res.json({ items, total: items.length });
});
```

Run: PASS. Commit.

---

### Task 3.8 — Test + implement GET /api/stats

Append test:

```js
test('GET /api/stats returns totals + per-class breakdown', async () => {
  const { app, db } = makeApp();
  try {
    const s1 = await createStudent(app, { student_id: 'P1-001', class: 'Primary 1A' });
    const s2 = await createStudent(app, { student_id: 'P1-002', class: 'Primary 1A' });
    const s3 = await createStudent(app, { student_id: 'P2-001', class: 'Primary 2A' });
    await createStudent(app, { student_id: 'P9-001', class: 'Primary 9A' }); // no events

    const year = getCurrentAcademicYear();
    // 3 events for s1, 1 for s2, 2 for s3 — all in current year
    for (let i = 0; i < 3; i++) db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s1.id, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s2.id, year);
    for (let i = 0; i < 2; i++) db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s3.id, year);
    // 1 event in a DIFFERENT year — should NOT count
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(s1.id, '2020/2021');

    const res = await request(app).get('/api/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.total_active_students, 4);
    assert.strictEqual(res.body.total_events_this_year, 6);
    assert.strictEqual(res.body.today_count, 0);  // we didn't insert today's events

    const byClass = Object.fromEntries(res.body.per_class.map(c => [c.class, c]));
    assert.strictEqual(byClass['Primary 1A'].student_count, 2);
    assert.strictEqual(byClass['Primary 1A'].event_count, 4);
    assert.strictEqual(byClass['Primary 2A'].student_count, 1);
    assert.strictEqual(byClass['Primary 2A'].event_count, 2);
  } finally { db.close(); }
});
```

Append route (new file `src/routes/stats.js`):

**`src/routes/stats.js`:**
```js
const express = require('express');
const router = express.Router();
const { getCurrentAcademicYear } = require('../lib/year');
const { getTodayUtc } = require('../lib/time');

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const year = getCurrentAcademicYear();
  const today = getTodayUtc();

  const totalActive = db.prepare('SELECT COUNT(*) AS n FROM students WHERE active = 1').get().n;
  const totalYear = db.prepare('SELECT COUNT(*) AS n FROM tardiness_events WHERE academic_year = ?').get(year).n;
  const todayCount = db.prepare(`SELECT COUNT(*) AS n FROM tardiness_events WHERE substr(occurred_at, 1, 10) = ?`).get(today).n;

  const perClass = db.prepare(`
    SELECT s.class,
           COUNT(DISTINCT s.id) AS student_count,
           COUNT(e.id) AS event_count,
           CASE WHEN COUNT(DISTINCT s.id) = 0 THEN 0
                ELSE ROUND(CAST(COUNT(e.id) AS REAL) / COUNT(DISTINCT s.id), 2)
           END AS avg_lates_per_student
    FROM students s
    LEFT JOIN tardiness_events e ON e.student_id = s.id AND e.academic_year = ?
    WHERE s.active = 1
    GROUP BY s.class
    ORDER BY s.class
  `).all(year);

  res.json({
    academic_year: year,
    total_active_students: totalActive,
    total_events_this_year: totalYear,
    today_count: todayCount,
    per_class: perClass,
  });
});

module.exports = router;
```

Mount in `src/app.js`:
```js
const statsRouter = require('./routes/stats');
app.use('/api/stats', statsRouter);
```

Run: PASS. Commit.

---

### ✅ Phase 3 Exit Criteria

- [x] 4 routes working: POST, GET list, GET /today, GET /stats
- [x] ~10 tests passing (POST + validations + filters + today + stats)
- [x] All earlier tests still pass
- [x] Manual smoke test of all 4 endpoints works
- [x] Timezone handling documented (UTC)

### Manual smoke test
```bash
S=$(curl -sS -X POST localhost:3000/api/students -H "Content-Type: application/json" -d '{"student_id":"P1-001","full_name":"Alex","class":"Primary 1A"}' | jq -r .id)
curl -sS -X POST localhost:3000/api/tardiness -H "Content-Type: application/json" -d "{\"student_id\":$S}"
curl -sS localhost:3000/api/tardiness
curl -sS localhost:3000/api/tardiness/today
curl -sS localhost:3000/api/stats
```

---
