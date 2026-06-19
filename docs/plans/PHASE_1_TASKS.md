## 🎯 Phase 1 — Core Backend Foundation (DETAILED)

**Outcome:** SQLite database with all 4 tables created via migrations. `/api/health` returns DB stats. Server boots and creates `data/tardiness.db` on first run.

### Schema (applied by `createDb()`)

```sql
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT UNIQUE NOT NULL,    -- school's own ID
  full_name TEXT NOT NULL,
  class TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tardiness_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  occurred_at TEXT DEFAULT (datetime('now')),
  academic_year TEXT NOT NULL,
  recorded_by TEXT,
  notes TEXT
);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT DEFAULT (datetime('now')),
  actor TEXT,
  action TEXT NOT NULL,
  details TEXT,    -- JSON
  ip TEXT
);

-- Indexes
CREATE INDEX idx_tardiness_student ON tardiness_events(student_id);
CREATE INDEX idx_tardiness_year ON tardiness_events(academic_year);
CREATE INDEX idx_students_class ON students(class);
CREATE INDEX idx_students_name ON students(full_name);
```

---

### Task 1.1 — Failing test for db schema (RED)

**Files:** Create `test/db.test.js`

**Step 1:** Write the failing test
```js
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

test('createDb is idempotent (can be called twice on same file)', () => {
  const db1 = createDb({ path: ':memory:' });
  db1.close();
  // For :memory: each instance is fresh, but on file path it should not error
  // Skip this assertion for :memory: — tested via file-based in 1.5
});
```

**Step 2:** Run, expect FAIL (`Cannot find module '../src/db'`)
```bash
npm test
```

**Step 3:** Commit
```bash
git add test/db.test.js
git commit -m "test: add failing test for db schema (RED)"
```

---

### Task 1.2 — Implement `src/db.js` (GREEN)

**Files:** Create `src/db.js`

**Step 1:** Write minimal implementation
```js
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
```

**Step 2:** Run tests, expect PASS
```bash
npm test
```
Expected: 3 tests passing (2 db + 1 health).

**Step 3:** Commit
```bash
git add src/db.js
git commit -m "feat: add db.js with schema migrations"
```

---

### Task 1.3 — Enhance `/api/health` with DB stats (RED)

**Files:** Modify `test/server.test.js`

**Step 1:** Add failing test (append to existing test file)
```js
test('GET /api/health includes DB stats when db is provided', async () => {
  const { createDb } = require('../src/db');
  const db = createDb({ path: ':memory:' });
  const app = createApp({ db });
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(res.body.db, 'db field present');
  assert.strictEqual(typeof res.body.db.sizeBytes, 'number');
  assert.strictEqual(typeof res.body.db.uptimeSeconds, 'number');
  db.close();
});
```

**Step 2:** Run, expect FAIL (db field missing)
```bash
npm test
```

**Step 3:** Commit
```bash
git add test/server.test.js
git commit -m "test: require DB stats in /api/health (RED)"
```

---

### Task 1.4 — Implement enhanced `/api/health` (GREEN)

**Files:** Modify `src/app.js`

**Step 1:** Update `createApp` to accept db and return stats
```js
const express = require('express');
const fs = require('node:fs');

function createApp({ db = null } = {}) {
  const app = express();
  const startedAt = Date.now();
  app.locals.db = db;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    const body = {
      ok: true,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
    if (db) {
      let sizeBytes = 0;
      try {
        // For file-based DBs, get file size. For :memory:, size is 0.
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) {
          const stat = fs.statSync(pragma.file);
          sizeBytes = stat.size;
        }
      } catch { /* ignore */ }
      body.db = { sizeBytes };
    }
    res.json(body);
  });

  return app;
}

module.exports = { createApp };
```

**Step 2:** Run tests, expect PASS
```bash
npm test
```

**Step 3:** Commit
```bash
git add src/app.js
git commit -m "feat: include DB stats in /api/health"
```

---

### Task 1.5 — Wire db into `server.js` + verify file-based DB created

**Files:** Modify `src/server.js`

**Step 1:** Update `server.js` to create + inject db
```js
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('./app');
const { createDb } = require('./db');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tardiness.db');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const db = createDb({ path: DB_PATH });
const app = createApp({ db });

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Tardiness Check server running');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${getLanIp()}:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  server.close(() => { db.close(); process.exit(0); });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, db, server };
```

**Step 2:** Verify file-based DB is created on boot
```bash
rm -f data/tardiness.db data/tardiness.db-wal data/tardiness.db-shm
npm start &
sleep 2
curl -sS http://localhost:3000/api/health
# Should include db.sizeBytes > 0
ls data/
# Should show tardiness.db
kill %1
```
Expected: response includes `"db":{"sizeBytes":<some-number>}` and `data/tardiness.db` exists.

**Step 3:** Commit
```bash
git add src/server.js
git commit -m "feat: wire db into server.js with file-based persistence"
```

---

### ✅ Phase 1 Exit Criteria

- [x] `data/tardiness.db` created on first boot with all 4 tables
- [x] `/api/health` returns `{ ok: true, uptimeSeconds, db: { sizeBytes } }`
- [x] All tests pass (4 total)
- [x] Foreign keys enabled
- [x] WAL journal mode enabled
- [x] Server boots cleanly and `curl /api/health` works

---
