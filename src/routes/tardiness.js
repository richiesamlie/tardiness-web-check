const express = require('express');
const router = express.Router();
const { toSqliteTimestamp, getTodayUtc } = require('../lib/time');

function eventWithStudent(db, whereSql, params, orderBy = 'e.occurred_at DESC, e.id DESC', limit = null, offset = 0) {
  let sql = `
    SELECT e.id, e.student_id, s.student_id AS school_id, s.full_name, s.class,
           e.occurred_at, e.academic_year, e.recorded_by, e.notes
    FROM tardiness_events e
    JOIN students s ON s.id = e.student_id
    ${whereSql}
    ${orderBy ? 'ORDER BY ' + orderBy : ''}
  `;
  const allParams = [...params];
  if (limit !== null) {
    sql += ' LIMIT ? OFFSET ?';
    allParams.push(limit, offset);
  }
  return db.prepare(sql).all(...allParams);
}

// POST /api/tardiness — mark a student late (NO PIN — fast path)
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const year = req.app.locals.getCurrentAcademicYear();
  const { student_id, notes, recorded_by, occurred_at } = req.body || {};
  const sid = parseInt(student_id, 10);
  if (!Number.isInteger(sid) || sid <= 0) {
    return res.status(400).json({ errors: ['student_id (numeric) is required'] });
  }

  let ts = null;
  if (occurred_at) {
    ts = toSqliteTimestamp(occurred_at);
    if (!ts) return res.status(400).json({ errors: ['occurred_at must be a valid ISO 8601 timestamp'] });
  }

  const student = db.prepare('SELECT id FROM students WHERE id = ? AND active = 1').get(sid);
  if (!student) return res.status(404).json({ errors: [`student id ${sid} not found or inactive`] });

  const info = db.prepare(`
    INSERT INTO tardiness_events (student_id, occurred_at, academic_year, recorded_by, notes)
    VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?)
  `).run(sid, ts, year, recorded_by || null, notes || null);

  const row = eventWithStudent(db, 'WHERE e.id = ?', [info.lastInsertRowid], null).pop();
  res.status(201).json(row);
});

// GET /api/tardiness — list with filters (public)
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
  if (date) { where.push("substr(e.occurred_at, 1, 10) = ?"); params.push(date); }
  if (classFilter) { where.push('s.class = ?'); params.push(classFilter); }
  if (schoolId) { where.push('s.student_id = ?'); params.push(schoolId); }
  const whereSql = 'WHERE ' + where.join(' AND ');

  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM tardiness_events e
    JOIN students s ON s.id = e.student_id
    ${whereSql}
  `).get(...params).n;

  const items = eventWithStudent(db, whereSql, params, 'e.occurred_at DESC, e.id DESC', limit, offset);
  res.json({ items, total, page, limit });
});

// GET /api/tardiness/today — events from today (UTC) (public)
router.get('/today', (req, res) => {
  const db = req.app.locals.db;
  const today = getTodayUtc();
  const items = eventWithStudent(
    db,
    "WHERE substr(e.occurred_at, 1, 10) = ?",
    [today],
    'e.occurred_at ASC'
  );
  res.json({ items, total: items.length });
});

module.exports = router;
