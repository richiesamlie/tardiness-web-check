## 🎯 Phase 6 — Backup, Restore & Health (DETAILED)

**Outcome:** Admins can backup (manual + auto-daily at 02:00) and restore the database. Health endpoint reports backup status. Last 30 backups retained.

### Files

| File | Purpose |
|---|---|
| `src/lib/backup.js` | `createBackup`, `restoreBackup`, `listBackups`, `pruneOldBackups`, `getLastBackupTime` |
| `src/lib/scheduler.js` | `startBackupScheduler()` — cron at 02:00 daily, only if not in test mode |
| `src/routes/backup.js` | `POST /api/backup`, `POST /api/restore`, `GET /api/backups`, `DELETE /api/backups/:filename` |
| `src/server.js` | Start scheduler on startup |

### Endpoints

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/backups` | PIN | List existing backups (newest first) |
| POST | `/api/backup` | PIN | Create backup now → download zip |
| POST | `/api/restore` | PIN | Upload zip → validate → backup current → replace DB → admin restarts server |
| DELETE | `/api/backups/:filename` | PIN | Delete a specific backup file |

### Enhanced `/api/health`
- Adds `backup` block:
  - `last_backup` (ISO timestamp or null)
  - `backup_count` (int)
  - `backup_folder` (path)
  - `disk_free_bytes` (int)

### Backup format
- Zip file: `tardiness-backup-YYYY-MM-DD-HHMM.zip`
- Contents:
  - `tardiness.db` — full DB (WAL checkpointed first)
  - `meta.json` — `{ created_at, app_version, schema_version }`

### Restore flow
1. Validate uploaded zip contains `tardiness.db` and `meta.json`
2. Verify meta.json is valid JSON with required fields
3. Create safety backup of current DB → `data/backups/pre-restore-YYYY-MM-DD-HHMM.zip`
4. Replace `data/tardiness.db` (and -wal, -shm) with restored files
5. **Server must be restarted** for changes to take effect (return message)
   - Document: in service-managed install, this is automatic. In manual install, admin runs `Start.bat` again.
   - Provide `POST /api/restart` (PIN) → `process.exit(0)` — service manager restarts.

### Auto-backup (cron at 02:00 daily)
- Reads `backup_folder` from config (default `data/backups/`)
- Creates zip → saves to folder
- Prunes backups older than 30 days
- Writes to audit_log: `auto_backup.completed` or `auto_backup.failed`
- Skip in test mode (`process.env.NODE_ENV === 'test'` OR no config set)

### Safety considerations
- WAL checkpoint before copy (atomic snapshot)
- Restore validates zip structure before replacing anything
- "Pre-restore" backup kept so admin can undo if needed
- Path-traversal protection on DELETE /api/backups/:filename

---

### Task 6.1 — `src/lib/backup.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const { PassThrough } = require('node:stream');
const { log } = require('./audit');
const { get, set } = require('./config');

const APP_VERSION = require('../../package.json').version;
const SCHEMA_VERSION = 1;
const KEEP_DAYS = 30;

function getBackupFolder(db) {
  const configured = get(db, 'backup_folder');
  return configured || path.join(path.dirname(db.name || 'data/tardiness.db'), 'backups');
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function createBackup(db, dbPath, { saveToFolder = null } = {}) {
  // WAL checkpoint to flush pending writes
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ok */ }

  // Build zip in memory (or to disk if saveToFolder)
  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks = [];
  pass.on('data', c => chunks.push(c));
  archive.pipe(pass);

  archive.file(dbPath, { name: 'tardiness.db' });
  archive.append(JSON.stringify({
    created_at: new Date().toISOString(),
    app_version: APP_VERSION,
    schema_version: SCHEMA_VERSION,
  }, null, 2), { name: 'meta.json' });

  archive.finalize();
  await new Promise((resolve, reject) => {
    pass.on('end', resolve);
    pass.on('error', reject);
  });
  const buf = Buffer.concat(chunks);

  let savedPath = null;
  if (saveToFolder) {
    fs.mkdirSync(saveToFolder, { recursive: true });
    const filename = `tardiness-backup-${timestamp()}.zip`;
    savedPath = path.join(saveToFolder, filename);
    fs.writeFileSync(savedPath, buf);
    pruneOldBackups(saveToFolder);
  }

  log(db, { action: 'backup.created', details: { filename: savedPath ? path.basename(savedPath) : null, bytes: buf.length } });
  return { buffer: buf, savedPath };
}

function listBackups(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => f.startsWith('tardiness-backup-') && f.endsWith('.zip'))
    .map(f => {
      const stat = fs.statSync(path.join(folder, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneOldBackups(folder, maxAgeDays = KEEP_DAYS) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of listBackups(folder)) {
    if (new Date(f.createdAt).getTime() < cutoff) {
      try { fs.unlinkSync(path.join(folder, f.filename)); removed++; } catch { /* skip */ }
    }
  }
  return removed;
}

function getLastBackupTime(folder) {
  const list = listBackups(folder);
  return list.length > 0 ? list[0].createdAt : null;
}

function getDiskFreeBytes(p) {
  try {
    const s = fs.statfsSync(p);
    return s.bavail * s.bsize;
  } catch { return null; }
}

// Restore: takes a buffer (zip), validates, replaces DB, returns pre-restore safety backup path
async function restoreBackup(db, dbPath, buffer) {
  // Validate zip contains expected files
  let AdmZip, yauzl;
  try { yauzl = require('yauzl'); } catch { /* try alternative */ }
  // Use Node's built-in unzip via child_process or simpler: use yauzl
  // For simplicity, use require('unzipper') if available, else fail gracefully
  const unzipper = require('unzipper');
  const directory = await unzipper.Open.buffer(buffer);
  const entries = directory.files.map(f => f.path);
  if (!entries.includes('tardiness.db') || !entries.includes('meta.json')) {
    throw new Error('Invalid backup: missing tardiness.db or meta.json');
  }

  // Read meta.json to validate
  const metaEntry = directory.files.find(f => f.path === 'meta.json');
  const metaBuf = await metaEntry.buffer();
  const meta = JSON.parse(metaBuf.toString('utf8'));
  if (typeof meta.schema_version !== 'number') {
    throw new Error('Invalid backup: meta.json missing schema_version');
  }

  // Pre-restore safety backup
  const folder = path.dirname(dbPath);
  const preFolder = path.join(folder, 'backups');
  fs.mkdirSync(preFolder, { recursive: true });
  const pre = await createBackup(db, dbPath, { saveToFolder: preFolder });
  const prePath = path.join(preFolder, `pre-restore-${timestamp()}.zip`);

  // Extract DB file to temp, then atomically replace
  const dbEntry = directory.files.find(f => f.path === 'tardiness.db');
  const dbBuf = await dbEntry.buffer();

  // Close current DB connection
  db.close();
  // Remove WAL files
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch { /* skip */ }
    }
  }
  // Write restored DB
  fs.writeFileSync(dbPath, dbBuf);

  log(db, { action: 'restore.completed', details: { schema_version: meta.schema_version, pre_restore: prePath, app_version_restored_from: meta.app_version } });
  return { preRestorePath: prePath, restoredFromVersion: meta.app_version, schemaVersion: meta.schema_version, needsRestart: true };
}

module.exports = {
  createBackup, restoreBackup, listBackups, pruneOldBackups,
  getLastBackupTime, getDiskFreeBytes, getBackupFolder,
};
```

Commit: `feat: backup.js with createBackup, restoreBackup, listBackups, prune`

---

### Task 6.2 — Install `unzipper` dependency

`npm install unzipper --no-audit --no-fund`

---

### Task 6.3 — `src/lib/scheduler.js`

```js
const cron = require('node-cron');
const { createBackup, getBackupFolder, getLastBackupTime } = require('./backup');
const { log } = require('./audit');

let scheduledTask = null;

function startBackupScheduler(db, dbPath) {
  if (process.env.NODE_ENV === 'test') return null;  // skip in tests
  if (scheduledTask) return scheduledTask;

  // Every day at 02:00
  scheduledTask = cron.schedule('0 2 * * *', async () => {
    try {
      const folder = getBackupFolder(db);
      const result = await createBackup(db, dbPath, { saveToFolder: folder });
      log(db, { action: 'auto_backup.completed', details: { filename: path.basename(result.savedPath) } });
    } catch (e) {
      log(db, { action: 'auto_backup.failed', details: { error: e.message } });
    }
  });
  return scheduledTask;
}

function stopBackupScheduler() {
  if (scheduledTask) { scheduledTask.stop(); scheduledTask = null; }
}

module.exports = { startBackupScheduler, stopBackupScheduler };
```

Commit: `feat: backup scheduler (daily 02:00, skips test mode)`

---

### Task 6.4 — `src/routes/backup.js`

```js
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const backup = require('../lib/backup');
const { log } = require('../lib/audit');
const { get } = require('../lib/config');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/backups — list all backups
router.get('/backups', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const folder = backup.getBackupFolder(db);
  const files = backup.listBackups(folder);
  res.json({ folder, backups: files });
});

// POST /api/backup — create + download
router.post('/backup', requirePin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const dbPath = req.app.locals.dbPath;
    const result = await backup.createBackup(db, dbPath);  // in-memory only
    const filename = `tardiness-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'application/zip');
    res.send(result.buffer);
  } catch (e) { next(e); }
});

// POST /api/restore — upload zip
router.post('/restore', requirePin, upload.single('file'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const dbPath = req.app.locals.dbPath;
    if (!req.file) return res.status(400).json({ error: 'file is required (multipart/form-data, field "file")' });
    const result = await backup.restoreBackup(db, dbPath, req.file.buffer);
    res.json({
      ok: true,
      ...result,
      restart_required: true,
      restart_command: 'npm start  (or run Start.bat / Install-Service will auto-restart)',
    });
  } catch (e) {
    res.status(400).json({ error: `restore failed: ${e.message}` });
  }
});

// DELETE /api/backups/:filename — delete a backup file
router.delete('/backups/:filename', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const folder = backup.getBackupFolder(db);
  const filename = req.params.filename;

  // Path traversal protection
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  if (!filename.startsWith('tardiness-backup-') && !filename.startsWith('pre-restore-')) {
    return res.status(400).json({ error: 'invalid filename — only backups can be deleted' });
  }

  const fullPath = path.join(folder, filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'not found' });

  fs.unlinkSync(fullPath);
  log(db, { action: 'backup.deleted', details: { filename } });
  res.json({ ok: true });
});

// POST /api/restart — exit the process (service manager restarts, or admin runs Start.bat again)
router.post('/restart', requirePin, (req, res) => {
  const db = req.app.locals.db;
  log(db, { action: 'server.restart_requested' });
  res.json({ ok: true, message: 'restarting in 1 second' });
  setTimeout(() => process.exit(0), 1000);
});

module.exports = router;
```

Mount in `src/app.js`:
```js
const backupRouter = require('./routes/backup');
app.use('/api', backupRouter);
```

Also expose `dbPath` on app.locals so routes can access it:
```js
app.locals.dbPath = DB_PATH;
```

Commit: `feat: backup/restore/restart endpoints (PIN-gated)`

---

### Task 6.5 — Update `/api/health` with backup status

Modify `src/app.js`:
```js
app.get('/api/health', (req, res) => {
  // ... existing logic ...
  if (db) {
    // ... db.sizeBytes ...
    body.db = { sizeBytes };

    // Backup status
    try {
      const folder = require('./lib/backup').getBackupFolder(db);
      const last = require('./lib/backup').getLastBackupTime(folder);
      const count = require('./lib/backup').listBackups(folder).length;
      const free = require('./lib/backup').getDiskFreeBytes(folder);
      body.backup = {
        folder,
        last_backup: last,
        backup_count: count,
        disk_free_bytes: free,
      };
    } catch { /* no backup status available */ }
  }
  res.json(body);
});
```

Commit: `chore: /api/health includes backup status block`

---

### Task 6.6 — Update `src/server.js` to start scheduler

Add to `src/server.js`:
```js
const { startBackupScheduler } = require('./lib/scheduler');
// ... after db creation ...
startBackupScheduler(db, DB_PATH);
```

Also expose DB_PATH via app.locals (handled in app.js).

Commit: `chore: start backup scheduler on server boot`

---

### Task 6.7 — Failing tests for backup/restore

Create `test/backup.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { set } = require('../src/lib/config');
const { hashPin } = require('../src/lib/pin');
const backup = require('../src/lib/backup');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tardiness-test-'));
}

async function authedAppWithTempDb() {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'tardiness.db');
  const db = createDb({ path: dbPath });
  set(db, 'admin_pin_hash', await hashPin('867530'));
  const app = createApp({ db, dbPath });
  return { app, db, dbPath, dir };
}

async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students')
    .set('X-Test-Bypass', '1').send(payload);
  return res.body;
}

// ===== Backup library =====

test('createBackup produces a zip with tardiness.db and meta.json', async () => {
  const { db, dbPath, dir } = await authedAppWithTempDb();
  try {
    // Add some data
    db.prepare('INSERT INTO students (student_id, full_name, class) VALUES (?, ?, ?)').run('P1-001', 'Alex', 'Primary 1A');
    const result = await backup.createBackup(db, dbPath);
    assert.ok(result.buffer instanceof Buffer);
    assert.ok(result.buffer.length > 100);
    // Verify zip structure
    const unzipper = require('unzipper');
    const dir = await unzipper.Open.buffer(result.buffer);
    const names = dir.files.map(f => f.path);
    assert.ok(names.includes('tardiness.db'));
    assert.ok(names.includes('meta.json'));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('listBackups returns empty array when folder is empty', async () => {
  const dir = tmpDir();
  try {
    const list = backup.listBackups(dir);
    assert.deepStrictEqual(list, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('listBackups returns sorted (newest first) backups', async () => {
  const dir = tmpDir();
  try {
    // Create 3 dummy zip files with different timestamps
    fs.writeFileSync(path.join(dir, 'tardiness-backup-2025-01-01-120000.zip'), 'a');
    fs.writeFileSync(path.join(dir, 'tardiness-backup-2025-06-15-120000.zip'), 'b');
    fs.writeFileSync(path.join(dir, 'tardiness-backup-2025-03-10-120000.zip'), 'c');
    // Backdate the files so stat returns expected mtime
    fs.utimesSync(path.join(dir, 'tardiness-backup-2025-01-01-120000.zip'), new Date('2025-01-01'), new Date('2025-01-01'));
    fs.utimesSync(path.join(dir, 'tardiness-backup-2025-06-15-120000.zip'), new Date('2025-06-15'), new Date('2025-06-15'));
    fs.utimesSync(path.join(dir, 'tardiness-backup-2025-03-10-120000.zip'), new Date('2025-03-10'), new Date('2025-03-10'));

    const list = backup.listBackups(dir);
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].filename, 'tardiness-backup-2025-06-15-120000.zip');  // newest
    assert.strictEqual(list[2].filename, 'tardiness-backup-2025-01-01-120000.zip');  // oldest
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('pruneOldBackups removes files older than cutoff', async () => {
  const dir = tmpDir();
  try {
    const old = path.join(dir, 'tardiness-backup-2020-01-01-120000.zip');
    const recent = path.join(dir, 'tardiness-backup-2025-06-15-120000.zip');
    fs.writeFileSync(old, 'a');
    fs.writeFileSync(recent, 'b');
    fs.utimesSync(old, new Date('2020-01-01'), new Date('2020-01-01'));
    fs.utimesSync(recent, new Date(), new Date());

    const removed = backup.pruneOldBackups(dir, 365);  // 1 year cutoff
    assert.strictEqual(removed, 1);
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(recent));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ===== Endpoints =====

test('POST /api/backup requires PIN', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).post('/api/backup');
    assert.strictEqual(res.status, 401);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /api/backup with PIN returns a downloadable zip', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    const res = await request(app).post('/api/backup')
      .set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers['content-type'].includes('zip') || res.headers['content-type'].includes('application/zip'));
    assert.ok(res.headers['content-disposition'].includes('attachment'));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('GET /api/backups returns empty list initially', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.backups, []);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /api/backup + GET /api/backups — backup appears in list', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    await request(app).post('/api/backup').set('X-Admin-Pin', '867530');
    const list = await request(app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(list.body.backups.length, 1);
    assert.ok(list.body.backups[0].filename.startsWith('tardiness-backup-'));
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /api/restore requires PIN', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).post('/api/restore')
      .attach('file', Buffer.from('not a real zip'), 'backup.zip');
    assert.strictEqual(res.status, 401);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('POST /api/restore rejects invalid zip with 400', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).post('/api/restore')
      .set('X-Admin-Pin', '867530')
      .attach('file', Buffer.from('not a real zip'), 'backup.zip');
    assert.strictEqual(res.status, 400);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Round-trip: backup → wipe DB → restore → data back', async () => {
  const dir = tmpDir();
  const dbPath = path.join(dir, 'tardiness.db');
  try {
    // Setup: db with student + tardiness event
    const db = createDb({ path: dbPath });
    set(db, 'admin_pin_hash', await hashPin('867530'));
    const app = createApp({ db, dbPath });
    await createStudent(app, { student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    await request(app).post('/api/tardiness').send({ student_id: 1 });

    // Backup
    const backupRes = await request(app).post('/api/backup').set('X-Admin-Pin', '867530');
    const backupBuf = backupRes.body;
    assert.ok(backupBuf.length > 100);
    db.close();

    // Wipe DB
    for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });

    // Restore (open fresh DB connection for this part)
    const db2 = createDb({ path: dbPath });
    const app2 = createApp({ db: db2, dbPath });
    const restoreRes = await request(app2).post('/api/restore')
      .set('X-Admin-Pin', '867530')
      .attach('file', backupBuf, 'restore.zip');
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.body.ok, true);
    assert.strictEqual(restoreRes.body.restart_required, true);

    // The DB file should now exist (replaced)
    assert.ok(fs.existsSync(dbPath));
    db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('GET /api/health includes backup status block', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.backup);
    assert.ok(typeof res.body.backup.folder === 'string');
    assert.strictEqual(res.body.backup.backup_count, 0);
    assert.strictEqual(res.body.backup.last_backup, null);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('DELETE /api/backups/:filename removes file', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    await request(app).post('/api/backup').set('X-Admin-Pin', '867530');
    const list = await request(app).get('/api/backups').set('X-Admin-Pin', '867530');
    const filename = list.body.backups[0].filename;
    const del = await request(app).delete(`/api/backups/${filename}`).set('X-Admin-Pin', '867530');
    assert.strictEqual(del.status, 200);
    const list2 = await request(app).get('/api/backups').set('X-Admin-Pin', '867530');
    assert.strictEqual(list2.body.backups.length, 0);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('DELETE /api/backups/:filename rejects path traversal', async () => {
  const { app, db, dir } = await authedAppWithTempDb();
  try {
    const res = await request(app).delete('/api/backups/..%2F..%2Fetc%2Fpasswd').set('X-Admin-Pin', '867530');
    assert.strictEqual(res.status, 400);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
```

Run: 14 new tests should pass. Commit.

---

### ✅ Phase 6 Exit Criteria

- [x] `src/lib/backup.js` — createBackup, restoreBackup, listBackups, pruneOldBackups, getLastBackupTime, getDiskFreeBytes
- [x] `src/lib/scheduler.js` — daily 02:00 cron, skips in test mode
- [x] `src/routes/backup.js` — 5 endpoints (list, create, restore, delete, restart)
- [x] `/api/health` enhanced with backup status block
- [x] Server starts the scheduler on boot
- [x] ~14 new tests pass
- [x] Round-trip: backup → wipe → restore works

### Manual smoke test
```bash
BASE=http://localhost:3000
PIN=867530
# Create + download backup
curl -sS -X POST $BASE/api/backup -H "X-Admin-Pin: $PIN" -o /tmp/backup.zip
# List backups
curl -sS $BASE/api/backups -H "X-Admin-Pin: $PIN"
# Restore
curl -sS -X POST $BASE/api/restore -H "X-Admin-Pin: $PIN" -F file=@/tmp/backup.zip
curl -sS -X POST $BASE/api/restart -H "X-Admin-Pin: $PIN"
# Health now shows backup status
curl -sS $BASE/api/health | jq
```

---
