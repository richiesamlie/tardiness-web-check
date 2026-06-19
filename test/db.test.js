const test = require('node:test');
const assert = require('node:assert');
const { createDb } = require('../src/db');

test('createDb creates all 4 user tables', () => {
  const db = createDb({ path: ':memory:' });
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const names = rows.map(r => r.name);
  assert.deepStrictEqual(names, ['audit_log', 'config', 'students', 'tardiness_events']);
  db.close();
});

test('createDb enables foreign keys', () => {
  const db = createDb({ path: ':memory:' });
  const row = db.prepare('PRAGMA foreign_keys').get();
  assert.strictEqual(row.foreign_keys, 1);
  db.close();
});
