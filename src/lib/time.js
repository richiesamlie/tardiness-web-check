// All timestamps are stored as UTC (datetime('now') in SQLite).
// "Today" = current UTC date (YYYY-MM-DD).

function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function toSqliteTimestamp(input) {
  // Accept ISO 8601 or Date; return SQLite 'YYYY-MM-DD HH:MM:SS' UTC string.
  // Returns null if input is invalid.
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = { getTodayUtc, toSqliteTimestamp };
