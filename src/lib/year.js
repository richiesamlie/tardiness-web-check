// Academic year helper. Reads from config (via get() to decode JSON); falls back to default.
// Routes use req.app.locals.getCurrentAcademicYear() so it reads from the active DB.

const { get } = require('./config');
const DEFAULT_ACADEMIC_YEAR = '2025/2026';

function createYearHelper(db) {
  return function getCurrentAcademicYear() {
    if (!db) return DEFAULT_ACADEMIC_YEAR;
    const v = get(db, 'academic_year');
    return v || DEFAULT_ACADEMIC_YEAR;
  };
}

// Legacy: for tests that don't have an app/db context
function legacyGetCurrentAcademicYear() {
  return DEFAULT_ACADEMIC_YEAR;
}

module.exports = { createYearHelper, getCurrentAcademicYear: legacyGetCurrentAcademicYear, DEFAULT_ACADEMIC_YEAR };
