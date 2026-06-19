const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    class TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tardiness_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    occurred_at TEXT DEFAULT (datetime('now')),
    academic_year TEXT NOT NULL,
    recorded_by TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT DEFAULT (datetime('now')),
    actor TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tardiness_student ON tardiness_events(student_id);
  CREATE INDEX IF NOT EXISTS idx_tardiness_year ON tardiness_events(academic_year);
  CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);
  CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name);
`;

function createDb({ path: dbPath }) {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

module.exports = { createDb };
