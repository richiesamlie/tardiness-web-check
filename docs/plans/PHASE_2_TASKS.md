## 🎯 Phase 2 — Students CRUD API (DETAILED)

**Outcome:** Full REST API for students with search, class filter, soft delete, and computed late count.

### Endpoints

| Method | Path | Behavior | Auth |
|---|---|---|---|
| GET | `/api/students` | List with optional `?search=&class=&includeInactive=&page=&limit=` | none (Phase 4 will add PIN) |
| GET | `/api/students/:id` | Detail + late_count for current academic year | none |
| POST | `/api/students` | Create one | none (Phase 4) |
| PUT | `/api/students/:id` | Update fields | none (Phase 4) |
| DELETE | `/api/students/:id` | Soft delete (sets active=0) | none (Phase 4) |

### Validation rules
- `student_id` required, string, unique, trimmed
- `full_name` required, string, trimmed
- `class` required, string, trimmed
- 400 with plain-English `errors[]` if invalid
- 409 if `student_id` already exists

### Late count
- Computed via subquery against `tardiness_events` filtered by `academic_year = <current>`
- For Phase 2: hardcoded academic year `"2025/2026"` (config-wired in Phase 4)
- Source: `src/lib/year.js::getCurrentAcademicYear()`

---

### Task 2.1 — `src/lib/year.js` helper

**Files:** Create `src/lib/year.js`

**Step 1:** Write (no test — pure function, trivial)
```js
// Phase 2 default — overridden by config in Phase 4
const DEFAULT_ACADEMIC_YEAR = '2025/2026';

function getCurrentAcademicYear() {
  return DEFAULT_ACADEMIC_YEAR;
}

module.exports = { getCurrentAcademicYear, DEFAULT_ACADEMIC_YEAR };
```

**Step 2:** Commit
```bash
git add src/lib/year.js
git commit -m "feat: add academic year helper (Phase 2 default, Phase 4 wires config)"
```

---

### Task 2.2 — Failing test: GET /api/students returns empty list

**Files:** Create `test/students.test.js`

**Step 1:** Write the failing test
```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');

function makeApp() {
  const db = createDb({ path: ':memory:' });
  return { app: createApp({ db }), db };
}

test('GET /api/students returns [] when empty', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).get('/api/students');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { items: [], total: 0 });
  } finally {
    db.close();
  }
});
```

**Step 2:** Run, expect FAIL (404 — router not mounted)
```bash
npm test
```

**Step 3:** Commit
```bash
git add test/students.test.js
git commit -m "test: require empty-list response for /api/students (RED)"
```

---

### Task 2.3 — Wire students router with empty GET / handler

**Files:** Create `src/routes/students.js`, modify `src/app.js`

**Step 1:** Create `src/routes/students.js`
```js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ items: [], total: 0 });
});

module.exports = router;
```

**Step 2:** Modify `src/app.js` to mount the router
```js
const express = require('express');
const fs = require('node:fs');
const studentsRouter = require('./routes/students');

function createApp({ db = null } = {}) {
  const app = express();
  const startedAt = Date.now();
  app.locals.db = db;

  app.use(express.json());
  app.use('/api/students', studentsRouter);

  app.get('/api/health', (req, res) => {
    const body = { ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) };
    if (db) {
      let sizeBytes = 0;
      try {
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) sizeBytes = fs.statSync(pragma.file).size;
      } catch { /* :memory: */ }
      body.db = { sizeBytes };
    }
    res.json(body);
  });

  return app;
}

module.exports = { createApp };
```

**Step 3:** Run, expect PASS
```bash
npm test
```

**Step 4:** Commit
```bash
git add src/routes/students.js src/app.js
git commit -m "feat: add GET /api/students returning empty list (GREEN)"
```

---

### Task 2.4 — Failing test: POST /api/students creates a student

**Files:** Modify `test/students.test.js`

**Step 1:** Append test
```js
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
  } finally {
    db.close();
  }
});
```

**Step 2:** Run, expect FAIL (404)
```bash
npm test
```

**Step 3:** Commit
```bash
git add test/students.test.js
git commit -m "test: require POST /api/students to create (RED)"
```

---

### Task 2.5 — Implement POST /api/students

**Files:** Modify `src/routes/students.js`

**Step 1:** Add POST handler
```js
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { student_id, full_name, class: klass } = req.body || {};
  const sid = (student_id || '').trim();
  const name = (full_name || '').trim();
  const cls = (klass || '').trim();

  const errors = [];
  if (!sid) errors.push('student_id is required');
  if (!name) errors.push('full_name is required');
  if (!cls) errors.push('class is required');
  if (errors.length) return res.status(400).json({ errors });

  try {
    const info = db.prepare(
      'INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)'
    ).run(sid, name, cls);
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ errors: [`student_id "${sid}" already exists`] });
    }
    throw err;
  }
});
```

**Step 2:** Run, expect PASS
```bash
npm test
```

**Step 3:** Commit
```bash
git add src/routes/students.js
git commit -m "feat: add POST /api/students with validation + duplicate check"
```

---

### Task 2.6 — Test: validation rejects missing fields with 400 + plain-English errors

**Files:** Modify `test/students.test.js`

**Step 1:** Append tests
```js
test('POST /api/students returns 400 with plain-English errors when fields missing', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).post('/api/students').send({ student_id: 'P1-001' });
    assert.strictEqual(res.status, 400);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.some(e => e.includes('full_name')));
    assert.ok(res.body.errors.some(e => e.includes('class')));
  } finally {
    db.close();
  }
});

test('POST /api/students returns 409 on duplicate student_id', async () => {
  const { app, db } = makeApp();
  try {
    await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Other', class: 'Primary 1B' });
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.errors[0].includes('P1-001'));
  } finally {
    db.close();
  }
});
```

**Step 2:** Run, expect PASS (already implemented in 2.5)
```bash
npm test
```

**Step 3:** Commit
```bash
git add test/students.test.js
git commit -m "test: cover 400 validation and 409 duplicate cases"
```

---

### Task 2.7 — Test + Implement GET /api/students/:id (with late_count)

**Files:** Modify both files

**Step 1:** Append tests
```js
test('GET /api/students/:id returns 404 for unknown id', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).get('/api/students/9999');
    assert.strictEqual(res.status, 404);
    assert.ok(res.body.error);
  } finally {
    db.close();
  }
});

test('GET /api/students/:id returns student + late_count', async () => {
  const { app, db } = makeApp();
  try {
    const create = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const sid = create.body.id;
    // Insert 2 tardiness events for current academic year
    const year = require('../src/lib/year').getCurrentAcademicYear();
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(sid, year);
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(sid, year);
    // Insert 1 for a different year (should not count)
    db.prepare('INSERT INTO tardiness_events (student_id, academic_year) VALUES (?, ?)').run(sid, '2020/2021');

    const res = await request(app).get(`/api/students/${sid}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, sid);
    assert.strictEqual(res.body.late_count, 2);
  } finally {
    db.close();
  }
});
```

**Step 2:** Append router handler
```js
const { getCurrentAcademicYear } = require('../lib/year');

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const year = getCurrentAcademicYear();
  const row = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM tardiness_events
            WHERE student_id = s.id AND academic_year = ?) AS late_count
    FROM students s WHERE s.id = ?
  `).get(year, id);
  if (!row) return res.status(404).json({ error: 'student not found' });
  res.json(row);
});
```

**Step 3:** Run, expect PASS
```bash
npm test
```

**Step 4:** Commit
```bash
git add src/routes/students.js test/students.test.js
git commit -m "feat: add GET /api/students/:id with computed late_count"
```

---

### Task 2.8 — Test + Implement PUT /api/students/:id

**Step 1:** Append test
```js
test('PUT /api/students/:id updates name and class', async () => {
  const { app, db } = makeApp();
  try {
    const create = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).put(`/api/students/${create.body.id}`)
      .send({ full_name: 'Alexandra Tan', class: 'Primary 1B' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.full_name, 'Alexandra Tan');
    assert.strictEqual(res.body.class, 'Primary 1B');
    assert.strictEqual(res.body.student_id, 'P1-001');  // unchanged
  } finally {
    db.close();
  }
});

test('PUT /api/students/:id returns 404 for unknown id', async () => {
  const { app, db } = makeApp();
  try {
    const res = await request(app).put('/api/students/9999').send({ full_name: 'X' });
    assert.strictEqual(res.status, 404);
  } finally {
    db.close();
  }
});
```

**Step 2:** Append router handler
```js
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'student not found' });

  const { full_name, class: klass } = req.body || {};
  const newName = (full_name !== undefined ? String(full_name) : existing.full_name).trim();
  const newClass = (klass !== undefined ? String(klass) : existing.class).trim();

  const errors = [];
  if (!newName) errors.push('full_name cannot be empty');
  if (!newClass) errors.push('class cannot be empty');
  if (errors.length) return res.status(400).json({ errors });

  db.prepare('UPDATE students SET full_name = ?, class = ? WHERE id = ?')
    .run(newName, newClass, id);
  const updated = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM tardiness_events
            WHERE student_id = s.id AND academic_year = ?) AS late_count
    FROM students s WHERE s.id = ?
  `).get(getCurrentAcademicYear(), id);
  res.json(updated);
});
```

**Step 3:** Run, expect PASS
```bash
npm test
```

**Step 4:** Commit
```bash
git add src/routes/students.js test/students.test.js
git commit -m "feat: add PUT /api/students/:id with validation"
```

---

### Task 2.9 — Test + Implement DELETE (soft delete)

**Step 1:** Append test
```js
test('DELETE /api/students/:id soft-deletes (sets active=0)', async () => {
  const { app, db } = makeApp();
  try {
    const create = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).delete(`/api/students/${create.body.id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    // Verify row still exists but active=0
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(create.body.id);
    assert.strictEqual(row.active, 0);
  } finally {
    db.close();
  }
});

test('GET /api/students excludes inactive by default', async () => {
  const { app, db } = makeApp();
  try {
    const c1 = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Active', class: 'Primary 1A' });
    const c2 = await request(app).post('/api/students')
      .send({ student_id: 'P1-002', full_name: 'Inactive', class: 'Primary 1A' });
    await request(app).delete(`/api/students/${c2.body.id}`);

    const list = await request(app).get('/api/students');
    assert.strictEqual(list.body.total, 1);
    assert.strictEqual(list.body.items[0].student_id, 'P1-001');

    const all = await request(app).get('/api/students?includeInactive=1');
    assert.strictEqual(all.body.total, 2);
  } finally {
    db.close();
  }
});
```

**Step 2:** Replace stub GET / handler with full implementation + add DELETE
```js
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const search = (req.query.search || '').trim();
  const classFilter = (req.query.class || '').trim();
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const year = getCurrentAcademicYear();

  const where = [];
  const params = [year];
  if (!includeInactive) where.push('s.active = 1');
  if (search) {
    where.push('(s.full_name LIKE ? OR s.student_id LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (classFilter) {
    where.push('s.class = ?');
    params.push(classFilter);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM students s ${whereSql}`)
    .get(...params).n;

  const items = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM tardiness_events
            WHERE student_id = s.id AND academic_year = ?) AS late_count
    FROM students s ${whereSql}
    ORDER BY s.class, s.full_name
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ items, total, page, limit });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'student not found' });
  res.json({ ok: true });
});
```

**Step 3:** Run, expect PASS
```bash
npm test
```

**Step 4:** Commit
```bash
git add src/routes/students.js test/students.test.js
git commit -m "feat: add DELETE (soft) + full GET list with search, class filter, late_count"
```

---

### ✅ Phase 2 Exit Criteria

- [x] 9 students-related tests pass (empty, create, validation, duplicate, 404, get with late_count, update, delete soft, exclude inactive)
- [x] All Phase 0/1 tests still pass
- [x] Server boots, manual curl smoke test works

### Manual smoke test
```bash
curl -sS http://localhost:3000/api/students
curl -sS -X POST http://localhost:3000/api/students -H "Content-Type: application/json" \
  -d '{"student_id":"P1-001","full_name":"Test Student","class":"Primary 1A"}'
curl -sS http://localhost:3000/api/students/1
curl -sS http://localhost:3000/api/students?search=Test
curl -sS http://localhost:3000/api/students?class=Primary%201A
curl -sS -X PUT http://localhost:3000/api/students/1 -H "Content-Type: application/json" \
  -d '{"full_name":"Updated Name"}'
curl -sS -X DELETE http://localhost:3000/api/students/1
```

---
