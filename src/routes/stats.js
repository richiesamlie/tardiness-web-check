const express = require('express');
const router = express.Router();
const { getTodayUtc } = require('../lib/time');

// GET /api/stats — totals + per-class breakdown + today count (public)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const year = req.app.locals.getCurrentAcademicYear();
  const today = getTodayUtc();

  const totalActive = db.prepare('SELECT COUNT(*) AS n FROM students WHERE active = 1').get().n;
  const totalYear = db.prepare('SELECT COUNT(*) AS n FROM tardiness_events WHERE academic_year = ?').get(year).n;
  const todayCount = db.prepare(
    "SELECT COUNT(*) AS n FROM tardiness_events WHERE substr(occurred_at, 1, 10) = ?"
  ).get(today).n;

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
