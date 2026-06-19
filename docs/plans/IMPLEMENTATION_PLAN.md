# Tardiness Check Web App — Implementation Plan

> **For:** Hermes executing this plan phase-by-phase.
> **Master plan:** `C:\Users\dewa5\tardiness-app-PLAN.md` (what & why).
> **This file:** how — phased, bite-sized, TDD-driven.
> **Workdir:** `C:\Users\dewa5\Downloads\Tardiness`

---

## 🎯 Goal

Build the v1 web app described in the master plan: a self-hosted, single-folder tardiness tracking system with a search-and-tap "mark late" page for gate staff and a wizard-protected roster/reports/settings area for non-IT admins. Supports CSV + XLSX import/export, auto-backup, demo mode, audit log, and a "Get Help" diagnostics button.

## 🏗️ Architecture

- **Backend:** Node.js + Express + `better-sqlite3` + `multer` + `xlsx` (SheetJS) + `bcrypt` + `archiver` + `node-cron`
- **Frontend:** Plain HTML + vanilla JS + small CSS (no build step, no framework)
- **Storage:** SQLite file at `data/tardiness.db`
- **Deployment:** Portable folder with `Start.bat` (double-click) + optional `Install-Service.bat` for auto-start

## 📐 Approach

- **TDD throughout** — every task: failing test → minimal code → pass → commit
- **Phased** — each phase ends with a verifiable milestone; user reviews before next phase
- **Frequent commits** — one commit per logical unit
- **DRY / YAGNI** — no speculative features; only what master plan §1 says

---

## 📦 Phased Roadmap (15 phases)

> Each phase ends with a runnable, verifiable state. After each phase, I'll show you the diff and you can sanity-check before I continue.

| # | Phase | Outcome | Est. |
|---|---|---|---|
| **0** | Project Skeleton & Tooling | `npm start` boots an empty Express server on :3000 | 30m |
| **1** | Core Backend Foundation | SQLite schema, `/api/health` working | 45m |
| **2** | Students CRUD API | GET/POST/PUT/DELETE + search + class filter | 60m |
| **3** | Tardiness Events API | POST (mark late), GET (list), GET /today, late-count | 45m |
| **4** | Config & PIN Auth | PIN middleware, wizard endpoints, recovery code | 60m |
| **5** | Import / Export (CSV + XLSX) | Template, export, two-step import preview+commit | 90m |
| **6** | Backup, Restore & Health | Zip backup, auto-backup cron, restore endpoint | 75m |
| **7** | Audit Log | All admin actions logged; `/api/audit` endpoint | 30m |
| **8** | Diagnostics | `/api/diagnostics` for "Get Help" feature | 30m |
| **9** | Frontend Foundation | CSS tokens, common.js (toast/undo/banner), PWA manifest | 60m |
| **10** | Tardiness Check Page | Big search + tap-to-mark + undo + recently-marked | 60m |
| **11** | Login + Roster Page | PIN login, table, CRUD UI, import/export UI | 90m |
| **12** | Reports + Settings + Wizard Pages | Reports, settings (year, PIN, backup), 4-screen wizard | 90m |
| **13** | Demo Mode | Load fake students for training; reset to real | 30m |
| **14** | Deployment Wrappers | Start.bat, Install-Service.bat, README.pdf, video script | 45m |
| **15** | Final Polish & Smoke Test | End-to-end manual smoke test, README update | 45m |

**Total: ~14 hours.** I'll do them in chunks with check-ins at phase boundaries (typically after every 2-3 phases).

---

## 🎯 Phase 0 — Project Skeleton & Tooling (DETAILED)

**Outcome:** `npm install && npm start` boots an empty Express server on `http://localhost:3000`. Test command works. Project structure exists.

### Task 0.1 — Create `.gitignore`

**Files:** Create `C:\Users\dewa5\Downloads\Tardiness\.gitignore`

**Step 1:** Write file with standard Node ignores:
```
node_modules/
data/*.db
data/*.db-journal
data/backups/
*.log
.DS_Store
Thumbs.db
.env
.env.local
coverage/
.nyc_output/
.idea/
.vscode/
```

**Step 2:** Commit
```bash
cd "/c/Users/dewa5/Downloads/Tardiness"
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

### Task 0.2 — Create `package.json`

**Files:** Create `package.json`

**Step 1:** Write the file (full contents):
```json
{
  "name": "tardiness-app",
  "version": "1.0.0",
  "private": true,
  "description": "Self-hosted tardiness tracking for schools",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/",
    "test:watch": "node --test --watch test/"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.5.0",
    "multer": "^1.4.5-lts.1",
    "xlsx": "^0.18.5",
    "bcrypt": "^5.1.1",
    "archiver": "^7.0.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

**Step 2:** Verify Node engines is satisfied (we have v25.6.1 ≥ 20 ✓)

**Step 3:** Commit
```bash
git add package.json
git commit -m "chore: add package.json with all v1 dependencies"
```

---

### Task 0.3 — Install dependencies

**Files:** N/A (creates `node_modules/` and `package-lock.json`)

**Step 1:** Run
```bash
cd "/c/Users/dewa5/Downloads/Tardiness"
npm install
```

**Expected:** `node_modules/` created, `package-lock.json` created, no errors. (Note: `better-sqlite3` and `bcrypt` are native modules — may take 30-60s on first install.)

**Step 2:** Verify
```bash
ls node_modules/.package-lock.json
node -e "console.log(require('express/package.json').version)"
```
Expected: Express version printed (e.g. `4.21.0`).

**Step 3:** Commit
```bash
git add package-lock.json
git commit -m "chore: install dependencies"
```

---

### Task 0.4 — Create directory structure

**Files:** Create empty placeholder directories

**Step 1:** Create dirs (with `.gitkeep` so they're tracked)
```bash
cd "/c/Users/dewa5/Downloads/Tardiness"
mkdir -p src/routes src/lib test public/css public/js public/audio data data/backups docs/plans
touch src/.gitkeep src/routes/.gitkeep src/lib/.gitkeep test/.gitkeep public/.gitkeep public/css/.gitkeep public/js/.gitkeep public/audio/.gitkeep data/.gitkeep data/backups/.gitkeep
```

**Step 2:** Verify
```bash
find . -type d -not -path './node_modules*' -not -path './.git*' | sort
```
Expected: lists all the new directories.

**Step 3:** Commit
```bash
git add .
git commit -m "chore: create directory structure"
```

---

### Task 0.5 — Write the empty server test (TDD: RED)

**Files:** Create `test/server.test.js`

**Step 1:** Write failing test:
```js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createApp } = require('../src/app');

test('GET /api/health returns { ok: true }', async () => {
  const app = createApp();
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { ok: true });
});
```

**Step 2:** Run test (should FAIL because `src/app.js` doesn't exist)
```bash
cd "/c/Users/dewa5/Downloads/Tardiness"
npm test
```
Expected: FAIL with "Cannot find module '../src/app'"

**Step 3:** Commit
```bash
git add test/server.test.js
git commit -m "test: add failing test for /api/health"
```

---

### Task 0.6 — Create minimal `src/app.js` (TDD: GREEN)

**Files:** Create `src/app.js`

**Step 1:** Write minimal implementation:
```js
const express = require('express');

function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
```

**Step 2:** Run test (should PASS)
```bash
npm test
```
Expected: 1 passed

**Step 3:** Commit
```bash
git add src/app.js
git commit -m "feat: add express app with /api/health"
```

---

### Task 0.7 — Create `src/server.js` entry point

**Files:** Create `src/server.js`

**Step 1:** Write the file:
```js
const { createApp } = require('./app');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  Tardiness Check server running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${require('os').networkInterfaces()['Wi-Fi']?.[0]?.address || 'localhost'}:${PORT}\n`);
});

module.exports = server;
```

**Step 2:** Update `package.json` to point at the right entry (already done — `"main": "src/server.js"`)

**Step 3:** Verify manually
```bash
cd "/c/Users/dewa5/Downloads/Tardiness"
timeout 5 npm start &
sleep 2
curl -s http://localhost:3000/api/health
```
Expected: `{"ok":true}`

**Step 4:** Commit
```bash
git add src/server.js
git commit -m "feat: add server entry point"
```

---

### Task 0.8 — Write `README.md` skeleton

**Files:** Create `README.md`

**Step 1:** Write:
```markdown
# Tardiness Check

Self-hosted tardiness tracking for schools. See `docs/plans/IMPLEMENTATION_PLAN.md` for the full plan and `C:\Users\dewa5\tardiness-app-PLAN.md` for the master spec.

## Quick Start (development)

```bash
npm install
npm start
```

Open http://localhost:3000

## Tests

```bash
npm test
```

## Status

🚧 **In development** — see IMPLEMENTATION_PLAN.md for progress.
```

**Step 2:** Commit
```bash
git add README.md
git commit -m "docs: add README skeleton"
```

---

### ✅ Phase 0 Exit Criteria

- [x] `git log` shows 8 commits (one per task)
- [x] `npm install` runs cleanly
- [x] `npm test` shows 1 passing test
- [x] `npm start` boots, `curl /api/health` returns `{"ok":true}`
- [x] Directory structure matches master plan §14
- [x] All tests pass before moving to Phase 1

---

## 📝 Phase 0 Progress Log

*(Updated as I execute. Each commit message is also recorded.)*

- `chore: add .gitignore`
- `chore: add package.json with all v1 dependencies`
- `chore: install dependencies`
- `chore: create directory structure`
- `test: add failing test for /api/health`
- `feat: add express app with /api/health`
- `feat: add server entry point`
- `docs: add README skeleton`

---

## 📋 What Comes Next

After Phase 0 exits cleanly, I'll show you the actual diff and ask: **"OK to proceed to Phase 1 (Core Backend Foundation: SQLite schema, migrations, real `/api/health` with DB size)? Or adjust Phase 0 first?"**

Phases 1–15 follow the same bite-sized TDD pattern. I'll only expand a phase into bite-sized tasks right before executing it, so the plan stays current.
