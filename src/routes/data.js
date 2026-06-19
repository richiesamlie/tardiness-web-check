const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const xlsx = require('../lib/xlsx');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },  // 5 MB
});

function setDownloadHeaders(res, filename, format) {
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  if (format === 'xlsx') {
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    res.set('Content-Type', 'text/csv; charset=utf-8');
  }
}

// ===== GET /api/template =====

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

// ===== GET /api/export =====

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
  const yearTag = year.replace('/', '-');

  if (scope === 'students') {
    const rows = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM tardiness_events
              WHERE student_id = s.id AND academic_year = ?) AS late_count
      FROM students s
      ORDER BY s.class, s.full_name
    `).all(year);
    const wb = xlsx.buildStudentsExport(rows, year);
    setDownloadHeaders(res, `students-${yearTag}-${stamp}.${format}`, format);
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
  setDownloadHeaders(res, `tardiness-${yearTag}-${stamp}.${format}`, format);
  return res.send(xlsx.writeBuffer(wb, format));
});

// ===== POST /api/import/preview =====

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

    // skip fully blank rows silently
    if (!sid && !name && !cls) continue;

    const rowNum = i + 2;  // row 1 is header
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
    } else if (existing.full_name !== name || existing.class !== cls) {
      updatedRows.push({
        student_id: sid,
        old_full_name: existing.full_name,
        new_full_name: name,
        old_class: existing.class,
        new_class: cls,
      });
    }
    // unchanged → silent skip (no new, no update, no error)
  }

  return { newRows, updatedRows, errors };
}

router.post('/import/preview', requirePin, upload.single('file'), (req, res) => {
  const db = req.app.locals.db;
  if (!req.file) {
    return res.status(400).json({ error: 'file is required (multipart/form-data, field "file")' });
  }
  const format = xlsx.detectFormat(req.file.originalname, req.file.mimetype);
  if (!format) {
    return res.status(400).json({ error: 'unsupported file format — use .xlsx or .csv' });
  }
  let rows;
  try {
    rows = xlsx.parseRows(req.file.buffer, format);
  } catch (e) {
    return res.status(400).json({ error: `failed to parse file: ${e.message}` });
  }
  const { newRows, updatedRows, errors } = categorizeRows(db, rows);
  res.json({
    format,
    sheet_used: format === 'xlsx' ? 'Students' : undefined,
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

// ===== POST /api/import/commit =====

router.post('/import/commit', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) {
    return res.status(400).json({ error: 'rows array is required and must be non-empty' });
  }

  const insert = db.prepare('INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE students SET full_name = ?, class = ? WHERE student_id = ?');
  const find = db.prepare('SELECT id FROM students WHERE student_id = ?');

  let added = 0, updated = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
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
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ added, updated, skipped, total_received: rows.length });
});

module.exports = router;
