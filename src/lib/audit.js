function log(db, { action, actor = null, details = null, ip = null }) {
  if (!db) return;
  db.prepare(`
    INSERT INTO audit_log (action, actor, details, ip)
    VALUES (?, ?, ?, ?)
  `).run(action, actor, details ? JSON.stringify(details) : null, ip);
}

function recent(db, { limit = 50, action = null } = {}) {
  if (!db) return [];
  let sql = 'SELECT * FROM audit_log';
  const params = [];
  if (action) { sql += ' WHERE action LIKE ?'; params.push(action + '%'); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

module.exports = { log, recent };
