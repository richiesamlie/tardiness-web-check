// Typed config storage. Values are JSON-encoded in the `config` table.

function get(db, key, defaultValue = null) {
  if (!db) return defaultValue;
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function set(db, key, value) {
  if (!db) throw new Error('config.set: db required');
  const v = JSON.stringify(value);
  db.prepare(`
    INSERT INTO config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, v);
}

function has(db, key) {
  if (!db) return false;
  return !!db.prepare('SELECT 1 FROM config WHERE key = ?').get(key);
}

module.exports = { get, set, has };
