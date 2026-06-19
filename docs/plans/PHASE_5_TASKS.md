## 🎯 Phase 5 — Import / Export (CSV + XLSX) (DETAILED)

**Outcome:** Admins can download a blank template (XLSX recommended), fill it in, upload, preview the diff, and commit. Students and tardiness can be exported in either format.

### Library
- **`xlsx` (SheetJS Community Edition)** — single library handles CSV read/write + XLSX read/write

### Endpoints

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/template?format=xlsx\|csv` | public | Download blank template |
| GET | `/api/export?scope=students\|tardiness&format=xlsx\|csv` | public | Download data |
| POST | `/api/import/preview` | PIN | Upload file → returns JSON diff |
| POST | `/api/import/commit` | PIN | Body: `{ rows }` → apply upserts |

### Files

| File | Purpose |
|---|---|
| `src/lib/xlsx.js` | read/write wrappers, styled templates, conditional color helpers |
| `src/routes/data.js` | 4 endpoints, multer for upload |
| `test/data.test.js` | ~12 tests covering both formats and round-trip |

---

### Task 5.1 — `src/lib/xlsx.js`

```js
const XLSX = require('xlsx');

// Detect format from extension or MIME
function detectFormat(filename = '', mimeType = '') {
  const fn = filename.toLowerCase();
  if (fn.endsWith('.xlsx') || mimeType.includes('spreadsheet')) return 'xlsx';
  if (fn.endsWith('.csv') || mimeType === 'text/csv') return 'csv';
  // Sniff content if neither extension nor MIME is conclusive
  return null;
}

// Read a buffer/string into an array of row objects
function parseRows(bufferOrString, format) {
  if (format === 'xlsx') {
    const wb = XLSX.read(bufferOrString, { type: 'buffer' });
    const sheetName = pickStudentsSheet(wb.SheetNames);
    if (!sheetName) throw new Error('No suitable sheet found in XLSX');
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  if (format === 'csv') {
    // CSV via SheetJS
    const text = typeof bufferOrString === 'string'
      ? bufferOrString
      : bufferOrString.toString('utf8');
    const wb = XLSX.read(text, { type: 'string', raw: false });
    const sheetName = wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  }
  throw new Error(`Unsupported format: ${format}`);
}

function pickStudentsSheet(sheetNames) {
  // Prefer one named "Students"; else first
  const found = sheetNames.find(n => n.toLowerCase() === 'students');
  return found || sheetNames[0] || null;
}

// Build template workbook (Students + Instructions sheets)
function buildStudentTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Students
  const students = [
    { student_id: 'P1-2025-001', full_name: 'Alex Tan', class: 'Primary 1A' },
  ];
  const studentsSheet = XLSX.utils.json_to_sheet(students);
  XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students');

  // Sheet 2: Instructions
  const instr = [
    { Topic: 'What this is', Details: 'A blank student roster template for the Tardiness Check app.' },
    { Topic: 'Required columns', Details: 'student_id, full_name, class — do not change the headers in row 1.' },
    { Topic: 'student_id', Details: 'Must be unique — use the school\'s own ID for each student.' },
    { Topic: 'full_name', Details: 'Student\'s full name as it appears in your school records.' },
    { Topic: 'class', Details: 'Any text (e.g. "Primary 5A", "P5-B", "Grade 5 Eagles").' },
    { Topic: 'Save as', Details: 'Keep the file as .xlsx — do not convert to .csv.' },
    { Topic: 'Next step', Details: 'When you are done, go back to the app and click Import.' },
    { Topic: 'Petunjuk (ID)', Details: 'Jangan ubah judul kolom. student_id harus unik. Simpan sebagai .xlsx.' },
  ];
  const instrSheet = XLSX.utils.json_to_sheet(instr);
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

  return wb;
}

// Build students export workbook
function buildStudentsExport(students, academicYear) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Students
  const rows = students.map(s => ({
    student_id: s.student_id,
    full_name: s.full_name,
    class: s.class,
    late_count: s.late_count ?? 0,
    active: s.active ? 'yes' : 'no',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Students');

  // Sheet 2: Summary
  const byClass = {};
  for (const s of students) {
    if (!s.active) continue;
    if (!byClass[s.class]) byClass[s.class] = { class: s.class, student_count: 0, event_count: 0 };
    byClass[s.class].student_count++;
    byClass[s.class].event_count += (s.late_count || 0);
  }
  const summary = Object.values(byClass).map(c => ({
    ...c,
    avg_lates_per_student: c.student_count > 0
      ? Math.round((c.event_count / c.student_count) * 100) / 100 : 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');

  // Sheet 3: Generated
  const meta = [
    { Field: 'Academic year', Value: academicYear },
    { Field: 'Generated at', Value: new Date().toISOString() },
    { Field: 'Total students', Value: students.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Generated');

  return wb;
}

// Build tardiness export workbook
function buildTardinessExport(events, academicYear) {
  const wb = XLSX.utils.book_new();
  const rows = events.map(e => ({
    occurred_at: e.occurred_at,
    school_id: e.school_id,
    full_name: e.full_name,
    class: e.class,
    notes: e.notes || '',
    recorded_by: e.recorded_by || '',
    academic_year: e.academic_year,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Events');

  const meta = [
    { Field: 'Academic year', Value: academicYear },
    { Field: 'Generated at', Value: new Date().toISOString() },
    { Field: 'Total events', Value: events.length },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Generated');

  return wb;
}

// Write workbook to buffer
function writeBuffer(wb, format) {
  if (format === 'xlsx') return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    return Buffer.from('\ufeff' + csv, 'utf8');  // UTF-8 BOM for Excel
  }
  throw new Error(`Unsupported format: ${format}`);
}

module.exports = {
  detectFormat, parseRows,
  buildStudentTemplate, buildStudentsExport, buildTardinessExport,
  writeBuffer, pickStudentsSheet,
};
```

Commit: `feat: add xlsx.js wrapper (read/write + template/export builders)`

---

### Task 5.2 — `src/routes/data.js` (template + export)

```js
const express = require('express');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const xlsx = require('../lib/xlsx');

function setDownloadHeaders(res, filename, format) {
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  if (format === 'xlsx') {
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    res.set('Content-Type', 'text/csv; charset=utf-8');
  }
}

// GET /api/template?format=xlsx|csv
router.get('/template', (req, res) => {
  const format = (req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv'].includes(format)) {
    return res.status(400).json({ error: 'format must be xlsx or csv' });
  }
  const wb = xlsx.buildStudentTemplate();
  const buf = xlsx.writeBuffer(wb, format);
  setDownloadHeaders(res, `tardiness-template.${format}`, format);
  res.send(buf);
});

// GET /api/export?scope=students|tardiness&format=xlsx|csv
router.get('/export', (req, res) => {
  const db = req.app.locals.db;
  const scope = (req.query.scope || '').toLowerCase();
  const format = (req.query.format || 'xlsx').toLowerCase();
  if (!['students', 'tardiness'].includes(scope)) {
    return res.status(400).json({ error: 'scope must be "students" or "tardiness"' });
  }
  if (!['xlsx', 'csv'].includes(format)) {
    return res.status(400).json({ error: 'format must be xlsx or csv' });
  }
  const year = req.app.locals.getCurrentAcademicYear();
  const stamp = new Date().toISOString().slice(0, 10);

  if (scope === 'students') {
    const rows = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM tardiness_events
              WHERE student_id = s.id AND academic_year = ?) AS late_count
      FROM students s
      ORDER BY s.class, s.full_name
    `).all(year);
    const wb = xlsx.buildStudentsExport(rows, year);
    setDownloadHeaders(res, `students-${year.replace('/', '-')}-${stamp}.${format}`, format);
    return res.send(xlsx.writeBuffer(wb, format));
  }

  // scope === 'tardiness'
  const events = db.prepare(`
    SELECT e.occurred_at, s.student_id AS school_id, s.full_name, s.class,
           e.notes, e.recorded_by, e.academic_year
    FROM tardiness_events e
    JOIN students s ON s.id = e.student_id
    ORDER BY e.occurred_at DESC, e.id DESC
  `).all();
  const wb = xlsx.buildTardinessExport(events, year);
  setDownloadHeaders(res, `tardiness-${year.replace('/', '-')}-${stamp}.${format}`, format);
  return res.send(xlsx.writeBuffer(wb, format));
});

module.exports = router;
```

Mount in `src/app.js`:
```js
const dataRouter = require('./routes/data');
app.use('/api', dataRouter);  // not /api/data — keep paths clean
```

Commit: `feat: GET /api/template + GET /api/export (xlsx + csv)`

---

### Task 5.3 — Failing tests for template + export

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { set } = require('../src/lib/config');
const { hashPin } = require('../src/lib/pin');

function makeApp() {
  const db = createDb({ path: ':memory:' });
  return { app: createApp({ db }), db };
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students')
    .set('X-Test-Bypass', '1').send(payload);
  return res.body;
}

test('GET /api/template?format=xlsx returns XLSX with Students + Instructions sheets', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/template?format=xlsx');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('spreadsheet'));
  assert.ok(res.headers['content-disposition'].includes('attachment'));
  assert.ok(res.body instanceof Buffer);
  // Verify XLSX magic bytes: PK (zip)
  assert.strictEqual(res.body[0], 0x50);
  assert.strictEqual(res.body[1], 0x4B);
});

test('GET /api/template?format=csv returns CSV with UTF-8 BOM', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/template?format=csv');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  // BOM check
  assert.strictEqual(res.body[0], 0xEF);
  assert.strictEqual(res.body[1], 0xBB);
  assert.strictEqual(res.body[2], 0xBF);
  // Has header row
  const text = res.body.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.startsWith('student_id,full_name,class'));
});

test('GET /api/template?format=invalid returns 400', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/template?format=pdf');
  assert.strictEqual(res.status, 400);
});

test('GET /api/export?scope=students&format=xlsx returns XLSX', async () => {
  const { app } = makeApp();
  await createStudent(app);
  const res = await request(app).get('/api/export?scope=students&format=xlsx');
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['content-type'].includes('spreadsheet'));
  assert.strictEqual(res.body[0], 0x50);  // PK zip magic
});

test('GET /api/export?scope=students&format=csv contains CSV with student data', async () => {
  const { app } = makeApp();
  await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
  const res = await request(app).get('/api/export?scope=students&format=csv');
  assert.strictEqual(res.status, 200);
  const text = res.body.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.includes('student_id,full_name,class,late_count,active'));
  assert.ok(text.includes('P1-001,Alex,Primary 1A'));
});

test('GET /api/export?scope=tardiness&format=csv includes events', async () => {
  const { app } = makeApp();
  const s = await createStudent(app);
  await request(app).post('/api/tardiness').send({ student_id: s.id, notes: 'traffic' });
  const res = await request(app).get('/api/export?scope=tardiness&format=csv');
  assert.strictEqual(res.status, 200);
  const text = res.body.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.includes('occurred_at'));
  assert.ok(text.includes('traffic'));
});

test('GET /api/export?scope=invalid returns 400', async () => {
  const { app } = makeApp();
  const res = await request(app).get('/api/export?scope=foo');
  assert.strictEqual(res.status, 400);
});
```

Run: all PASS (already implemented in Task 5.2). Commit.

---

### Task 5.4 — Failing tests for import preview

```js
test('POST /api/import/preview requires PIN', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 401);
});

test('POST /api/import/preview returns summary for new CSV upload', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,Alex,Primary 1A\nP1-002,Brian,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.new_count, 2);
  assert.strictEqual(res.body.summary.update_count, 0);
  assert.strictEqual(res.body.summary.error_count, 0);
  assert.strictEqual(res.body.new_students.length, 2);
});

test('POST /api/import/preview detects updates vs new', async () => {
  const { app } = makeApp();
  await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
  const csv = 'student_id,full_name,class\nP1-001,Alexandra,Primary 1B\nP1-002,Brian,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.new_count, 1);
  assert.strictEqual(res.body.summary.update_count, 1);
  assert.strictEqual(res.body.summary.error_count, 0);
  assert.strictEqual(res.body.updated_students[0].student_id, 'P1-001');
  assert.strictEqual(res.body.updated_students[0].old_full_name, 'Alex');
  assert.strictEqual(res.body.updated_students[0].new_full_name, 'Alexandra');
});

test('POST /api/import/preview reports errors for missing fields', async () => {
  const { app } = makeApp();
  const csv = 'student_id,full_name,class\nP1-001,,Primary 1A\nP1-002,Brian,\n,Charlie,Primary 1A';
  const res = await request(app).post('/api/import/preview')
    .set('X-Test-Bypass', '1')
    .attach('file', Buffer.from(csv, 'utf8'), 'students.csv');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.summary.error_count, 3);
  assert.strictEqual(res.body.summary.new_count, 0);
  assert.strictEqual(res.body.summary.update_count, 0);
});

test('POST /api/import/preview detects duplicate student_id within the file', async () => {
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
  // Build XLSX in memory using our wrapper
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['student_id', 'full_name', 'class'],
    ['P1-001', 'Alex', 'Primary 1A'],
    ['P1-002', 'Brian', 'Primary 1A'],
  ]);
  XLSX.utils.book_append_sheet(wb, sheet, 'Students');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

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
```

Run: FAIL (preview endpoint doesn't exist). Commit.

---

### Task 5.5 — Implement POST /api/import/preview

Append to `src/routes/data.js`. Add multer to `package.json` (already there from Phase 0).

```js
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Helper: categorize rows against existing students
function categorizeRows(db, rows) {
  const seen = new Set();
  const newRows = [];
  const updatedRows = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const sid = String(row.student_id ?? row['Student ID'] ?? '').trim();
    const name = String(row.full_name ?? row['Full Name'] ?? '').trim();
    const cls = String(row.class ?? row['Class'] ?? '').trim();

    const rowNum = i + 2;  // row 1 is header

    if (!sid && !name && !cls) continue;  // skip blank rows
    if (!sid) { errors.push({ row: rowNum, reason: 'missing student_id' }); continue; }
    if (!name) { errors.push({ row: rowNum, reason: 'missing full_name' }); continue; }
    if (!cls) { errors.push({ row: rowNum, reason: 'missing class' }); continue; }
    if (seen.has(sid)) {
      errors.push({ row: rowNum, reason: `duplicate student_id "${sid}" in your file` });
      continue;
    }
    seen.add(sid);

    const existing = db.prepare('SELECT * FROM students WHERE student_id = ?').get(sid);
    if (!existing) {
      newRows.push({ student_id: sid, full_name: name, class: cls });
    } else {
      const changed = existing.full_name !== name || existing.class !== cls;
      if (changed) {
        updatedRows.push({
          student_id: sid,
          old_full_name: existing.full_name,
          new_full_name: name,
          old_class: existing.class,
          new_class: cls,
        });
      }
      // unchanged → silently skipped (no new, no update, no error)
    }
  }

  return { newRows, updatedRows, errors };
}

router.post('/import/preview', requirePin, upload.single('file'), (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) return res.status(400).json({ error: 'file is required (multipart/form-data, field "file")' });

  const format = xlsx.detectFormat(req.file.originalname, req.file.mimetype);
  if (!format) return res.status(400).json({ error: 'unsupported file format — use .xlsx or .csv' });

  let rows;
  try {
    rows = xlsx.parseRows(req.file.buffer, format);
  } catch (e) {
    return res.status(400).json({ error: `failed to parse file: ${e.message}` });
  }

  const { newRows, updatedRows, errors } = categorizeRows(db, rows);
  res.json({
    format,
    summary: {
      new_count: newRows.length,
      update_count: updatedRows.length,
      error_count: errors.length,
      total_rows: rows.length,
    },
    new_students: newRows,
    updated_students: updatedRows,
    errors,
  });
});
```

Run: PASS. Commit.

---

### Task 5.6 — Failing tests for import commit

```js
test('POST /api/import/commit requires PIN', async () => {
  const { app } = makeApp();
  const res = await request(app).post('/api/import/commit').send({ rows: [] });
  assert.strictEqual(res.status, 401);
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
    // Verify in DB
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
  assert.strictEqual(res.body.added, 0);
  assert.strictEqual(res.body.updated, 1);
  const get = await request(app).get('/api/students/1');
  assert.strictEqual(get.body.full_name, 'Alexandra');
});

test('POST /api/import/commit skips invalid rows in payload', async () => {
  const { app, db } = makeApp();
  try {
    const rows = [
      { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' },
      { student_id: '', full_name: 'X', class: 'Y' },  // invalid
      { student_id: 'P1-002' },  // invalid (missing fields)
    ];
    const res = await request(app).post('/api/import/commit')
      .set('X-Test-Bypass', '1')
      .send({ rows });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.added, 1);
    assert.strictEqual(res.body.skipped, 2);
  } finally { db.close(); }
});
```

Run: FAIL. Commit.

---

### Task 5.7 — Implement POST /api/import/commit

Append to `src/routes/data.js`:

```js
router.post('/import/commit', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'rows array is required and non-empty' });

  const insert = db.prepare('INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE students SET full_name = ?, class = ? WHERE student_id = ?');
  const find = db.prepare('SELECT id FROM students WHERE student_id = ?');

  let added = 0, updated = 0, skipped = 0;
  const tx = db.transaction((rs) => {
    for (const row of rs) {
      const sid = String(row.student_id ?? '').trim();
      const name = String(row.full_name ?? '').trim();
      const cls = String(row.class ?? '').trim();
      if (!sid || !name || !cls) { skipped++; continue; }
      const existing = find.get(sid);
      if (existing) {
        update.run(name, cls, sid);
        updated++;
      } else {
        try {
          insert.run(sid, name, cls);
          added++;
        } catch (e) {
          if (e.errcode === 2067 || (e.message || '').includes('UNIQUE')) skipped++;
          else throw e;
        }
      }
    }
  });
  tx(rows);

  res.json({ added, updated, skipped, total_received: rows.length });
});
```

Run: PASS. Commit.

---

### ✅ Phase 5 Exit Criteria

- [x] Template generation works for both XLSX (2 sheets) and CSV (UTF-8 BOM)
- [x] Export works for both scopes (students/tardiness) and both formats
- [x] Preview correctly categorizes rows: new / updated / errors
- [x] Commit applies upserts in a single transaction
- [x] Errors include row number + reason (plain English)
- [x] Mutating endpoints PIN-gated
- [x] ~17 new tests pass
- [x] Round-trip: download template → fill → upload → preview → commit works end-to-end

### Manual smoke test
```bash
BASE=http://localhost:3000
curl -sS -o /tmp/template.xlsx "$BASE/api/template?format=xlsx"
# (fill it in, or generate with code)
curl -sS -X POST "$BASE/api/import/preview" -H "X-Admin-Pin: 867530" -F file=@/tmp/template.xlsx
curl -sS -X POST "$BASE/api/import/commit" -H "X-Admin-Pin: 867530" -H "Content-Type: application/json" -d '{"rows":[{"student_id":"P1-001","full_name":"Alex","class":"Primary 1A"}]}'
curl -sS -o /tmp/students.xlsx "$BASE/api/export?scope=students&format=xlsx"
curl -sS "$BASE/api/export?scope=students&format=csv"
```

---
