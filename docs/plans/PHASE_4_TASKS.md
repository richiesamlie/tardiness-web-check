## 🎯 Phase 4 — Config & PIN Auth (DETAILED)

**Outcome:** Admin PIN protects all mutating endpoints. Configurable school name + academic year (read from DB, not hardcoded). First-run wizard works. Recovery code mechanism in place.

### Files added/changed

| File | Purpose |
|---|---|
| `src/lib/config.js` | Typed `get(key, default)` / `set(key, value)` |
| `src/lib/pin.js` | bcryptjs hash/verify + recovery code gen/hash/verify |
| `src/lib/audit.js` | `log(db, action, details, req)` helper |
| `src/middleware/requirePin.js` | Express middleware — checks `X-Admin-Pin` header |
| `src/routes/config.js` | `GET/PUT /api/config` |
| `src/routes/wizard.js` | 4-step first-run wizard endpoints |
| `src/routes/students.js` | Apply `requirePin` to POST/PUT/DELETE |
| `src/lib/year.js` | `createYearHelper(db)` factory — reads from config |
| `src/app.js` | Wire new helpers + mount new routers |

### Public vs private config

`GET /api/config` (public, no PIN):
- `school_name`
- `academic_year`
- `wizard_completed`

`GET /api/config/all` (PIN-gated):
- everything public
- `has_pin` (boolean)
- `recovery_code_active` (boolean)

`PUT /api/config` (PIN-gated):
- Body can include: `school_name`, `academic_year`, `backup_folder`

### PIN middleware
- Header: `X-Admin-Pin: 123456`
- 401 with `WWW-Authenticate: PIN` if invalid
- 503 with `{ error: "PIN not set" }` if no PIN configured yet (wizard incomplete)
- For test mode: `X-Test-Bypass: 1` bypasses PIN (only when `NODE_ENV=test`)

### Recovery code
- 16-char alphanumeric, grouped `XXXX-XXXX-XXXX-XXXX`
- Generated when PIN is set
- Returned ONCE in wizard step response (and stored hashed)
- Endpoint `POST /api/wizard/reset-pin` accepts recovery code + new PIN, returns new recovery code

### Year helper refactor
- New: `createYearHelper(db)` returns a function that reads `academic_year` from config, falls back to `"2025/2026"`
- App attaches to `app.locals.getCurrentAcademicYear`
- Existing routes switch from `getCurrentAcademicYear()` import to `req.app.locals.getCurrentAcademicYear()`

---

### Task 4.1 — `src/lib/config.js`

```js
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
```

Commit: `feat: add config get/set/has helpers`

---

### Task 4.2 — `src/lib/pin.js`

```js
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const BCRYPT_ROUNDS = 10;

async function hashPin(pin) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN must be 4-8 digits');
  return bcrypt.hash(String(pin), BCRYPT_ROUNDS);
}

async function verifyPin(pin, hash) {
  if (!hash) return false;
  try { return await bcrypt.compare(String(pin), hash); } catch { return false; }
}

function generateRecoveryCode() {
  // XXXX-XXXX-XXXX-XXXX, uppercase alphanumeric (no 0/O/1/I confusion: use unambiguous charset)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/1/I/O
  const group = () => Array.from(crypto.randomBytes(4), b => alphabet[b % alphabet.length]).join('');
  return `${group()}-${group()}-${group()}-${group()}`;
}

async function hashRecoveryCode(code) {
  return bcrypt.hash(code.toUpperCase(), BCRYPT_ROUNDS);
}

async function verifyRecoveryCode(code, hash) {
  if (!hash || !code) return false;
  try { return await bcrypt.compare(String(code).toUpperCase(), hash); } catch { return false; }
}

const WEAK_PINS = new Set(['1234', '1111', '0000', '12345', '123456', '111111', '000000', '1234567', '12345678']);
function isWeakPin(pin) { return WEAK_PINS.has(String(pin)); }

module.exports = {
  hashPin, verifyPin,
  generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode,
  isWeakPin,
};
```

Commit: `feat: add pin + recovery code helpers (bcryptjs)`

---

### Task 4.3 — `src/lib/audit.js`

```js
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
```

Commit: `feat: add audit log helper`

---

### Task 4.4 — `src/middleware/requirePin.js`

```js
const { verifyPin } = require('../lib/pin');
const { get } = require('../lib/config');

function requirePin(req, res, next) {
  // Test bypass (only when NODE_ENV=test)
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-bypass'] === '1') return next();

  const db = req.app.locals.db;
  const hash = get(db, 'admin_pin_hash');
  if (!hash) {
    return res.status(503).json({ error: 'PIN not configured. Complete the first-run wizard to set one.' });
  }

  const pin = req.headers['x-admin-pin'];
  if (!pin) {
    res.set('WWW-Authenticate', 'PIN');
    return res.status(401).json({ error: 'PIN required' });
  }

  verifyPin(pin, hash).then(ok => {
    if (!ok) {
      res.set('WWW-Authenticate', 'PIN');
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    next();
  }).catch(next);
}

module.exports = { requirePin };
```

Commit: `feat: add requirePin middleware (X-Admin-Pin header)`

---

### Task 4.5 — Failing tests for PIN behavior

Append to `test/server.test.js` (or new `test/auth.test.js`):

```js
const { hashPin, generateRecoveryCode } = require('../src/lib/pin');
const { set } = require('../src/lib/config');

async function makeAuthedApp() {
  const db = createDb({ path: ':memory:' });
  const pinHash = await hashPin('123456');
  set(db, 'admin_pin_hash', pinHash);
  return { app: createApp({ db }), db, pin: '123456' };
}

test('POST /api/students without PIN returns 401', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 401);
  } finally { db.close(); }
});

test('POST /api/students with correct PIN succeeds', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .set('X-Admin-Pin', pin)
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 201);
  } finally { db.close(); }
});

test('POST /api/students with wrong PIN returns 401', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).post('/api/students')
      .set('X-Admin-Pin', 'wrong')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 401);
  } finally { db.close(); }
});

test('POST /api/tardiness does NOT require PIN (fast path)', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    // Create student first (with PIN)
    const c = await request(app).post('/api/students')
      .set('X-Admin-Pin', '123456')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    // Mark late WITHOUT PIN
    const res = await request(app).post('/api/tardiness')
      .send({ student_id: c.body.id });
    assert.strictEqual(res.status, 201);
  } finally { db.close(); }
});

test('Protected route returns 503 when no PIN configured (wizard incomplete)', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/students')
      .send({ student_id: 'P1-001', full_name: 'Alex', class: 'Primary 1A' });
    assert.strictEqual(res.status, 503);
    assert.ok(res.body.error.includes('wizard'));
  } finally { db.close(); }
});
```

Run: most FAIL (POST returns 201 currently). Commit.

---

### Task 4.6 — Apply requirePin to students.js mutating routes

Modify `src/routes/students.js`:
```js
const { requirePin } = require('../middleware/requirePin');
// ...
router.post('/', requirePin, (req, res) => { ... });
router.put('/:id', requirePin, (req, res) => { ... });
router.delete('/:id', requirePin, (req, res) => { ... });
```

Run existing students tests — they will FAIL because they don't send PIN. Fix tests by using `NODE_ENV=test` + `X-Test-Bypass: 1` header in `createStudent` helper, OR set a known PIN first.

Commit: `feat: gate students POST/PUT/DELETE with requirePin`

---

### Task 4.7 — Update existing test helpers to bypass PIN

In `test/students.test.js` and `test/tardiness.test.js`, update helpers:

```js
async function createStudent(app, overrides = {}) {
  const payload = { student_id: 'P1-001', full_name: 'Alex Tan', class: 'Primary 1A', ...overrides };
  const res = await request(app).post('/api/students')
    .set('X-Test-Bypass', '1')
    .send(payload);
  return res.body;
}
```

For DELETE in students tests, also add `.set('X-Test-Bypass', '1')`.

(NODE_ENV=test will be set by `node --test` automatically? Let me verify. **Actually NO** — NODE_ENV is not set by default. Need to set it in package.json test script: `node --no-warnings --test --test-isolation=none`... or set NODE_ENV=test in the script.)

Update `package.json`:
```json
"test": "node --no-warnings --test",
"test:auth": "cross-env NODE_ENV=test node --no-warnings --test"
```
Actually simpler: just always set NODE_ENV=test in the test script:
```json
"test": "NODE_ENV=test node --no-warnings --test"
```
(works on Windows + Linux + macOS for simple assignment)

Run: existing tests pass again. Commit.

---

### Task 4.8 — Refactor year helper to read from config

**`src/lib/year.js`:**
```js
const DEFAULT_ACADEMIC_YEAR = '2025/2026';

function createYearHelper(db) {
  return function getCurrentAcademicYear() {
    if (!db) return DEFAULT_ACADEMIC_YEAR;
    const row = db.prepare("SELECT value FROM config WHERE key = 'academic_year'").get();
    return row?.value || DEFAULT_ACADEMIC_YEAR;
  };
}

// Keep legacy export for any code that doesn't pass db
function getCurrentAcademicYear() { return DEFAULT_ACADEMIC_YEAR; }

module.exports = { createYearHelper, getCurrentAcademicYear, DEFAULT_ACADEMIC_YEAR };
```

**`src/app.js`** — attach to locals:
```js
const { createYearHelper } = require('./lib/year');
// inside createApp:
app.locals.getCurrentAcademicYear = createYearHelper(db);
```

**Update existing routes** (`students.js`, `tardiness.js`, `stats.js`):
- Replace `require('../lib/year')` + `getCurrentAcademicYear()` calls with `req.app.locals.getCurrentAcademicYear()`
- Keep `getCurrentAcademicYear` import only for tests that need it directly

Existing tests still pass (config empty, returns DEFAULT_ACADEMIC_YEAR = "2025/2026").

Commit: `refactor: year helper reads from config (db-driven)`

---

### Task 4.9 — `src/routes/config.js`

```js
const express = require('express');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const { get, set, has } = require('../lib/config');

const PUBLIC_KEYS = ['school_name', 'academic_year', 'wizard_completed'];

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const body = {};
  for (const k of PUBLIC_KEYS) body[k] = get(db, k, null);
  res.json(body);
});

router.get('/all', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const body = {};
  for (const k of PUBLIC_KEYS) body[k] = get(db, k, null);
  body.has_pin = has(db, 'admin_pin_hash');
  body.recovery_code_active = has(db, 'recovery_code_hash');
  body.backup_folder = get(db, 'backup_folder', null);
  res.json(body);
});

router.put('/', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const { school_name, academic_year, backup_folder } = req.body || {};
  const errors = [];
  if (school_name !== undefined && !String(school_name).trim()) errors.push('school_name cannot be empty');
  if (academic_year !== undefined && !String(academic_year).trim()) errors.push('academic_year cannot be empty');
  if (errors.length) return res.status(400).json({ errors });
  if (school_name !== undefined) set(db, 'school_name', String(school_name).trim());
  if (academic_year !== undefined) set(db, 'academic_year', String(academic_year).trim());
  if (backup_folder !== undefined) set(db, 'backup_folder', String(backup_folder).trim());
  res.json({ ok: true });
});

module.exports = router;
```

Mount in `src/app.js`:
```js
const configRouter = require('./routes/config');
app.use('/api/config', configRouter);
```

Tests for config endpoint:
```js
test('GET /api/config returns public fields without PIN', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).get('/api/config');
    assert.strictEqual(res.status, 200);
    assert.ok('school_name' in res.body);
    assert.ok('academic_year' in res.body);
    assert.ok('wizard_completed' in res.body);
    assert.ok(!('has_pin' in res.body));  // private
  } finally { db.close(); }
});

test('PUT /api/config requires PIN', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const res = await request(app).put('/api/config').send({ school_name: 'X' });
    assert.strictEqual(res.status, 401);
    const ok = await request(app).put('/api/config')
      .set('X-Admin-Pin', '123456').send({ school_name: 'New School' });
    assert.strictEqual(ok.status, 200);
  } finally { db.close(); }
});

test('Setting academic_year via /api/config is reflected in /api/stats', async () => {
  const { app, db, pin } = await makeAuthedApp();
  try {
    await request(app).put('/api/config')
      .set('X-Admin-Pin', pin)
      .send({ academic_year: '2024/2025' });
    const stats = await request(app).get('/api/stats');
    assert.strictEqual(stats.body.academic_year, '2024/2025');
  } finally { db.close(); }
});
```

Commit: `feat: GET/PUT /api/config (PIN-gated) + year drives from config`

---

### Task 4.10 — `src/routes/wizard.js`

```js
const express = require('express');
const router = express.Router();
const { get, set, has } = require('../lib/config');
const {
  hashPin, generateRecoveryCode, hashRecoveryCode, isWeakPin
} = require('../lib/pin');
const { log } = require('../lib/audit');

router.get('/status', (req, res) => {
  const db = req.app.locals.db;
  res.json({
    completed: !!get(db, 'wizard_completed', false),
    has_school: has(db, 'school_name'),
    has_year: has(db, 'academic_year'),
    has_pin: has(db, 'admin_pin_hash'),
  });
});

router.post('/step/school', (req, res) => {
  const db = req.app.locals.db;
  const name = String(req.body?.school_name || '').trim();
  if (!name) return res.status(400).json({ errors: ['school_name is required'] });
  set(db, 'school_name', name);
  res.json({ ok: true });
});

router.post('/step/year', (req, res) => {
  const db = req.app.locals.db;
  const year = String(req.body?.academic_year || '').trim();
  if (!year || !/^\d{4}\/\d{4}$/.test(year)) {
    return res.status(400).json({ errors: ['academic_year must be in format YYYY/YYYY (e.g. 2025/2026)'] });
  }
  set(db, 'academic_year', year);
  res.json({ ok: true });
});

router.post('/step/pin', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { pin, pin_confirm } = req.body || {};
    const errors = [];
    if (!pin) errors.push('pin is required');
    else if (!/^\d{4,8}$/.test(String(pin))) errors.push('pin must be 4-8 digits');
    if (pin !== pin_confirm) errors.push('pin and pin_confirm do not match');
    if (isWeakPin(pin)) errors.push('pin is too weak (avoid 1234, 1111, etc.)');
    if (errors.length) return res.status(400).json({ errors });
    const hash = await hashPin(pin);
    const code = generateRecoveryCode();
    const codeHash = await hashRecoveryCode(code);
    set(db, 'admin_pin_hash', hash);
    set(db, 'recovery_code_hash', codeHash);
    log(db, { action: 'wizard.set_pin', details: { recovery_generated: true } });
    res.json({ ok: true, recovery_code: code, recovery_message: 'Save this code somewhere safe — it is the ONLY way to reset your PIN if you forget it. This is the only time it will be shown.' });
  } catch (e) { next(e); }
});

router.post('/reset-pin', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { recovery_code, pin, pin_confirm } = req.body || {};
    const errors = [];
    if (!recovery_code) errors.push('recovery_code is required');
    if (!pin || !/^\d{4,8}$/.test(String(pin))) errors.push('pin must be 4-8 digits');
    if (pin !== pin_confirm) errors.push('pin and pin_confirm do not match');
    if (isWeakPin(pin)) errors.push('pin is too weak');
    if (errors.length) return res.status(400).json({ errors });
    const codeHash = get(db, 'recovery_code_hash');
    const ok = await require('../lib/pin').verifyRecoveryCode(recovery_code, codeHash);
    if (!ok) return res.status(403).json({ errors: ['invalid recovery code'] });
    const newHash = await hashPin(pin);
    const newCode = generateRecoveryCode();
    const newCodeHash = await hashRecoveryCode(newCode);
    set(db, 'admin_pin_hash', newHash);
    set(db, 'recovery_code_hash', newCodeHash);
    log(db, { action: 'wizard.reset_pin' });
    res.json({ ok: true, recovery_code: newCode });
  } catch (e) { next(e); }
});

router.post('/complete', (req, res) => {
  const db = req.app.locals.db;
  if (!has(db, 'school_name') || !has(db, 'academic_year') || !has(db, 'admin_pin_hash')) {
    return res.status(400).json({ errors: ['wizard incomplete — finish school, year, and pin steps first'] });
  }
  set(db, 'wizard_completed', true);
  log(db, { action: 'wizard.completed' });
  res.json({ ok: true });
});

module.exports = router;
```

Mount in `src/app.js`:
```js
const wizardRouter = require('./routes/wizard');
app.use('/api/wizard', wizardRouter);
```

Tests for wizard:
```js
test('Wizard step/school sets school_name', async () => {
  const { app, db } = await makeAuthedApp(); // already has PIN but wizard itself doesn't need it
  try {
    const res = await request(app).post('/api/wizard/step/school')
      .send({ school_name: 'Elyon Christian Primary School' });
    assert.strictEqual(res.status, 200);
    const cfg = await request(app).get('/api/config');
    assert.strictEqual(cfg.body.school_name, 'Elyon Christian Primary School');
  } finally { db.close(); }
});

test('Wizard step/year validates YYYY/YYYY format', async () => {
  const { app, db } = await makeAuthedApp();
  try {
    const bad = await request(app).post('/api/wizard/step/year').send({ academic_year: '2025' });
    assert.strictEqual(bad.status, 400);
    const ok = await request(app).post('/api/wizard/step/year').send({ academic_year: '2025/2026' });
    assert.strictEqual(ok.status, 200);
  } finally { db.close(); }
});

test('Wizard step/pin returns recovery code on success', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/step/pin')
      .send({ pin: '867530', pin_confirm: '867530' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.recovery_code);
    assert.ok(res.body.recovery_code.match(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/));
  } finally { db.close(); }
});

test('Wizard complete fails if steps missing', async () => {
  const db = createDb({ path: ':memory:' });
  try {
    const app = createApp({ db });
    const res = await request(app).post('/api/wizard/complete');
    assert.strictEqual(res.status, 400);
  } finally { db.close(); }
});
```

Commit: `feat: first-run wizard endpoints (school, year, pin, complete, reset-pin)`

---

### ✅ Phase 4 Exit Criteria

- [x] Mutating endpoints (students POST/PUT/DELETE, config PUT) require PIN
- [x] PIN bcrypt-hashed, never logged or returned
- [x] Recovery code generated on PIN set, returned ONCE, can reset PIN
- [x] Academic year reads from config
- [x] Wizard endpoints work for first-run setup
- [x] POST /api/tardiness still does NOT require PIN (fast path)
- [x] All earlier tests still pass (with X-Test-Bypass in test mode)
- [x] New auth/wizard tests pass

### Manual smoke test
```bash
# Without PIN — should 503
curl -i -X POST localhost:3000/api/students -H "Content-Type: application/json" -d '{}'

# Wizard
curl -X POST localhost:3000/api/wizard/step/school -H "Content-Type: application/json" -d '{"school_name":"Test School"}'
curl -X POST localhost:3000/api/wizard/step/year -H "Content-Type: application/json" -d '{"academic_year":"2025/2026"}'
curl -X POST localhost:3000/api/wizard/step/pin -H "Content-Type: application/json" -d '{"pin":"123456","pin_confirm":"123456"}'
# ↑ returns recovery_code in response — SAVE IT!
curl -X POST localhost:3000/api/wizard/complete

# With PIN — should work
curl -X POST localhost:3000/api/students -H "X-Admin-Pin: 123456" -H "Content-Type: application/json" -d '{"student_id":"P1-001","full_name":"Alex","class":"Primary 1A"}'
curl -X PUT localhost:3000/api/config -H "X-Admin-Pin: 123456" -H "Content-Type: application/json" -d '{"school_name":"New Name"}'

# Reset PIN with recovery code
curl -X POST localhost:3000/api/wizard/reset-pin -H "Content-Type: application/json" -d '{"recovery_code":"XXXX-...","pin":"654321","pin_confirm":"654321"}'
```

---
