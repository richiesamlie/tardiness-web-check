// SheetJS wrapper for CSV + XLSX read/write.
// Community Edition — no fancy conditional formatting, but multi-sheet + UTF-8 BOM works.

const XLSX = require('xlsx');

// Detect format from filename extension or MIME type
function detectFormat(filename = '', mimeType = '') {
  const fn = filename.toLowerCase();
  if (fn.endsWith('.xlsx') || (mimeType || '').includes('spreadsheet')) return 'xlsx';
  if (fn.endsWith('.csv') || mimeType === 'text/csv') return 'csv';
  return null;
}

function pickStudentsSheet(sheetNames) {
  if (!sheetNames || sheetNames.length === 0) return null;
  const found = sheetNames.find(n => n.toLowerCase() === 'students');
  return found || sheetNames[0];
}

// Parse a buffer/string into an array of row objects
function parseRows(bufferOrString, format) {
  if (format === 'xlsx') {
    const wb = XLSX.read(bufferOrString, { type: 'buffer' });
    const sheetName = pickStudentsSheet(wb.SheetNames);
    if (!sheetName) throw new Error('No sheets found in XLSX file');
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  }
  if (format === 'csv') {
    const text = typeof bufferOrString === 'string'
      ? bufferOrString
      : bufferOrString.toString('utf8');
    const wb = XLSX.read(text, { type: 'string', raw: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('No data in CSV file');
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  }
  throw new Error(`Unsupported format: ${format}`);
}

// ===== Template builders =====

function buildStudentTemplate() {
  const wb = XLSX.utils.book_new();

  const studentsSheet = XLSX.utils.json_to_sheet([
    { student_id: 'P1-2025-001', full_name: 'Alex Tan', class: 'Primary 1A' },
  ]);
  XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students');

  const instrSheet = XLSX.utils.json_to_sheet([
    { Topic: 'What this is', Details: 'A blank student roster template for the Tardiness Check app.' },
    { Topic: 'Required columns', Details: 'student_id, full_name, class — do not change the headers in row 1.' },
    { Topic: 'student_id', Details: "Must be unique — use the school's own ID for each student." },
    { Topic: 'full_name', Details: "Student's full name as it appears in your school records." },
    { Topic: 'class', Details: 'Any text (e.g. "Primary 5A", "P5-B", "Grade 5 Eagles").' },
    { Topic: 'Save as', Details: 'Keep the file as .xlsx — do not convert to .csv.' },
    { Topic: 'Next step', Details: 'When you are done, go back to the app and click Import.' },
    { Topic: 'Petunjuk (ID)', Details: 'Jangan ubah judul kolom. student_id harus unik. Simpan sebagai .xlsx.' },
  ]);
  XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');

  return wb;
}

// ===== Export builders =====

function buildStudentsExport(students, academicYear) {
  const wb = XLSX.utils.book_new();

  const rows = students.map(s => ({
    student_id: s.student_id,
    full_name: s.full_name,
    class: s.class,
    late_count: s.late_count ?? 0,
    active: s.active ? 'yes' : 'no',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Students');

  const byClass = new Map();
  for (const s of students) {
    if (!s.active) continue;
    const cur = byClass.get(s.class) || { class: s.class, student_count: 0, event_count: 0 };
    cur.student_count++;
    cur.event_count += (s.late_count || 0);
    byClass.set(s.class, cur);
  }
  const summary = Array.from(byClass.values()).map(c => ({
    ...c,
    avg_lates_per_student: c.student_count > 0
      ? Math.round((c.event_count / c.student_count) * 100) / 100
      : 0,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Field: 'Academic year', Value: academicYear },
    { Field: 'Generated at', Value: new Date().toISOString() },
    { Field: 'Total students', Value: students.length },
  ]), 'Generated');

  return wb;
}

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

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Field: 'Academic year', Value: academicYear },
    { Field: 'Generated at', Value: new Date().toISOString() },
    { Field: 'Total events', Value: events.length },
  ]), 'Generated');

  return wb;
}

// ===== Output =====

function writeBuffer(wb, format) {
  if (format === 'xlsx') return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
    return Buffer.from('\ufeff' + csv, 'utf8');  // UTF-8 BOM for Excel
  }
  throw new Error(`Unsupported format: ${format}`);
}

module.exports = {
  detectFormat, parseRows, pickStudentsSheet,
  buildStudentTemplate, buildStudentsExport, buildTardinessExport,
  writeBuffer,
};
