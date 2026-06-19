const express = require('express');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const { log: logAudit } = require('../lib/audit');

// ===== Helpers =====

function parseInt32(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function validateStudentBody(body) {
  const errors = [];
  const sid = (body?.student_id ?? '').toString().trim();
  const name = (body?.full_name ?? '').toString().trim();
  const cls = (body?.class ?? '').toString().trim();
  if (!sid) errors.push('student_id is required');
  if (!name) errors.push('full_name is required');
  if (!cls) errors.push('class is required');
  return { errors, sid, name, cls };
}

// ===== Routes =====

// List students (search, class filter, pagination, soft-delete aware) — public
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const year = req.app.locals.getCurrentAcademicYear();
  const search = (req.query.search || '').trim();
  const classFilter = (req.query.class || '').trim();
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
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
    FROM students s
    ${whereSql}
    ORDER BY s.class, s.full_name
    LIMIT ? OFFSET ?
  `).all(year, ...params, limit, offset);

  res.json({ items, total, page, limit });
});

// Get single student — public
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt32(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const year = req.app.locals.getCurrentAcademicYear();
  const row = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM tardiness_events
            WHERE student_id = s.id AND academic_year = ?) AS late_count
    FROM students s WHERE s.id = ?
  `).get(year, id);
  if (!row) return res.status(404).json({ error: 'student not found' });
  res.json(row);
});

// Create student — PIN-gated
router.post('/', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const { errors, sid, name, cls } = validateStudentBody(req.body);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const info = db.prepare(
      'INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)'
    ).run(sid, name, cls);
    const row = db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);
    try { logAudit(db, { action: 'student.created', details: { student_id: sid, full_name: name, class: cls }, ip: req.ip }); } catch {}
    res.status(201).json(row);
  } catch (err) {
    if (err.errcode === 2067 || (err.message || '').includes('UNIQUE constraint')) {
      return res.status(409).json({ errors: [`student_id "${sid}" already exists`] });
    }
    throw err;
  }
});

// Update student — PIN-gated
router.put('/:id', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt32(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'student not found' });

  const body = req.body || {};
  const newName = (body.full_name !== undefined ? String(body.full_name) : existing.full_name).trim();
  const newClass = (body.class !== undefined ? String(body.class) : existing.class).trim();

  const errors = [];
  if (!newName) errors.push('full_name cannot be empty');
  if (!newClass) errors.push('class cannot be empty');
  if (errors.length) return res.status(400).json({ errors });

  db.prepare('UPDATE students SET full_name = ?, class = ? WHERE id = ?')
    .run(newName, newClass, id);
  const year = req.app.locals.getCurrentAcademicYear();
  const updated = db.prepare(`
    SELECT s.*,
           (SELECT COUNT(*) FROM tardiness_events
            WHERE student_id = s.id AND academic_year = ?) AS late_count
    FROM students s WHERE s.id = ?
  `).get(year, id);
  try { logAudit(db, { action: 'student.updated', details: { id, full_name: newName, class: newClass }, ip: req.ip }); } catch {}
  res.json(updated);
});

// Soft-delete student — PIN-gated
router.delete('/:id', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const id = parseInt32(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  const info = db.prepare('UPDATE students SET active = 0 WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'student not found' });
  try { logAudit(db, { action: 'student.deleted', details: { id }, ip: req.ip }); } catch {}
  res.json({ ok: true });
});

module.exports = router;
