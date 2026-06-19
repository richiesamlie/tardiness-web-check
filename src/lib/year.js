// Phase 2 default — overridden by config in Phase 4
const DEFAULT_ACADEMIC_YEAR = '2025/2026';

function getCurrentAcademicYear() {
  return DEFAULT_ACADEMIC_YEAR;
}

module.exports = { getCurrentAcademicYear, DEFAULT_ACADEMIC_YEAR };
