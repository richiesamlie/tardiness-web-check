# 📋 Tardiness Check

> A self-hosted tardiness tracking web app for schools. One folder, one server, no IT staff needed.

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Node: 22+](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)
![Tests: 112](https://img.shields.io/badge/tests-112%20passing-success)
![Status: Production](https://img.shields.io/badge/status-production-blue)
![Release: automated](https://img.shields.io/badge/release-automated-blueviolet)

Built for schools that need a **simple, private, easy-to-operate** way to track student lateness — without cloud subscriptions, mobile apps, or IT support.

> 📥 **[Download the latest release](https://github.com/richiesamlie/tardiness-web-check/releases/latest)** — extract, double-click `Start.bat`, follow the wizard. Done.

The app runs on a single computer at your school, displays on any tablet/phone/laptop on the same Wi-Fi, and stores all data in a single SQLite file you can back up with a copy-paste.

---

## ✨ Features

### For gate staff (no PIN required)
- 🔍 **Search-and-tap marking** — type a few letters, tap the name, done. Under 5 seconds per student.
- 🕐 **Server-side timestamps** — never lose track of "when" even if the tablet's clock is wrong.
- 📋 **"Recently marked today"** sidebar — see who just got marked (prevents double-marking).
- 🎯 **Reason tags** — optional: Traffic, Medical, Family, Other.

### For admins (PIN-protected)
- 👥 **Roster management** — add, edit, delete, search, filter by class.
- 📊 **Reports** — today, this week, per-class breakdown, top offenders.
- 📥 **Import / Export** — Excel (`.xlsx`) and CSV. Two-step preview before commit.
- 💾 **Automatic daily backups** at 2 AM + manual backup + restore.
- 🔐 **PIN auth** with **recovery code** (16-character, unambiguous alphabet).
- 📝 **Audit log** of every admin action (who, when, what).
- 🛟 **"Get Help" button** — copies a complete diagnostics report to your clipboard.
- 🧙 **First-run wizard** — 4 screens, ~2 minutes, no manual needed.

### For the IT-curious
- 🪶 **Light footprint** — ~3,700 lines of code, **5 npm dependencies** (10 → 5 after native replacement pass).
- 🔒 **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, request IDs.
- 📦 **Zero install on client devices** — tablets just open a URL in a browser.
- 🌐 **Offline-first** — no internet required at runtime. Works on a school's LAN only.
- 🧪 **112 backend tests** — runs in <5s with the Node.js native test runner.

---

## 🚀 Quick Start

You need **Node.js 22 or later** (LTS). Get it from [nodejs.org](https://nodejs.org/) — one-time install, ~2 minutes.

### Windows

```cmd
1. Double-click  Start.bat
```

That's it. The browser opens at `http://localhost:3000` automatically.

### macOS

```bash
1. Double-click  Start.command
```

(First run: if macOS blocks it, right-click → Open → Open in the dialog.)

### Linux / manual

```bash
npm install        # one-time, ~30 seconds
npm start          # starts on http://localhost:3000
```

### First-run wizard (4 screens, ~2 minutes)

1. **School name** — e.g. "Elyon Christian Primary School"
2. **Academic year** — pick from suggestions (e.g. `2025/2026`)
3. **Admin PIN** — 4 to 8 digits
4. **Recovery code** — **write this down or print it!** Format: `XXXX-XXXX-XXXX-XXXX`. This is the only way to recover your PIN if forgotten.

### Add students

**Option A — one at a time** (good for small classes):
- Click **Roster** → **Add student** → fill in ID, name, class → Save

**Option B — Excel import** (good for large schools):
- Click **Roster** → **Import** → **Download template** → fill in your roster in Excel → upload the file → preview → commit

---

## 📱 Using the App

### Gate staff workflow

```
1. Open http://<server-ip>:3000 on the tablet
2. Type the student's name (or just first few letters)
3. Tap their name → "Confirm late mark" modal appears
4. Tap "Mark late" → done in under 5 seconds
```

> Tip: Add the page to your tablet's home screen for full-screen, no-browser-bar operation (iOS Safari: Share → Add to Home Screen; Android Chrome: menu → Add to Home Screen).

### Admin workflow

- Click **Roster** to manage students
- Click **Reports** for statistics
- Click **Settings** to change school name, year, PIN, backup settings
- All admin pages require your PIN

### Connecting from tablets

When the server starts, it prints:

```
  Tardiness Check server running
  Local:   http://localhost:3000
  Network: http://192.168.1.42:3000    ← use this URL on tablets
```

The "Network" URL works on any device on the same Wi-Fi as the server.

---

## 🛠️ Auto-Start on Boot (Windows)

For a "set and forget" installation:

1. Run **`Install-Service.bat`** (one-time, requires admin)
2. The app starts automatically every time you log in to Windows
3. Run **`Uninstall-Service.bat`** to remove

The app also survives reboots and crashes — Node.js starts the server and stays running until you log out or kill it.

---

## 📁 Project Structure

```
tardiness-web-check/
├── Start.bat / Start.command    ← double-click launchers
├── Install-Service.bat          ← auto-start on Windows logon
├── Uninstall-Service.bat
├── package.json
├── README.md                    ← you are here
├── LICENSE                      ← MIT
│
├── src/                         ← backend (Node.js + Express)
│   ├── server.js                ← entry point + graceful shutdown
│   ├── app.js                   ← Express app + middleware chain
│   ├── db.js                    ← SQLite setup + 4-table schema
│   ├── config.js                ← env-driven config
│   ├── errors.js                ← typed error classes
│   ├── routes/                  ← 27 API endpoints across 9 routers
│   │   ├── students.js          ← CRUD + search + late_count
│   │   ├── tardiness.js         ← record + query events
│   │   ├── stats.js             ← per-class + overall totals
│   │   ├── config.js            ← school name, academic year, PIN
│   │   ├── wizard.js            ← 4-step first-run setup
│   │   ├── data.js              ← import / export / template
│   │   ├── backup.js            ← backup / restore
│   │   └── diagnostics.js       ← audit log + health + Get Help
│   ├── lib/                     ← helpers
│   │   ├── pin.js               ← bcrypt PIN + recovery codes
│   │   ├── audit.js             ← structured audit log
│   │   ├── backup.js            ← zip → extract round-trip
│   │   ├── xlsx.js              ← Excel read/write (SheetJS)
│   │   ├── year.js              ← academic year rollover
│   │   └── scheduler.js         ← native setTimeout-based auto-backup
│   └── middleware/              ← request id, native gzip, manual security
│                                  headers, native rate limit (Map-based),
│                                  error handling
│
├── public/                      ← frontend (no build step)
│   ├── index.html               ← Mark Late (gate staff)
│   ├── wizard.html              ← First-run setup
│   ├── login.html               ← PIN entry
│   ├── roster.html              ← Student management
│   ├── reports.html             ← Statistics
│   ├── settings.html            ← Admin settings
│   ├── css/style.css            ← modern design system (~840 lines)
│   └── js/common.js             ← icon(), API, Auth, modal, toast, topbar
│
├── test/                        ← 112 backend tests (Node native test runner)
│   ├── server.test.js
│   ├── wizard.test.js
│   ├── students.test.js
│   ├── tardiness.test.js
│   ├── middleware.test.js
│   └── ...
│
├── data/                        ← your data (gitignored)
│   ├── tardiness.db             ← single SQLite file
│   └── backups/                 ← daily auto-backups (.zip)
│
├── scripts/
│   └── capture-screenshots.js   ← puppeteer screenshot helper
│
├── screenshots/                 ← UI screenshots (auto-generated)
│
└── docs/
    ├── VIDEO_SCRIPT.md          ← walkthrough video script
    └── *.md                     ← implementation plans and specs
```

---

## 📦 Releases

Pre-built distribution ZIPs are published automatically:

**👉 [Latest release](https://github.com/richiesamlie/tardiness-web-check/releases/latest)**

Each release includes:

| File | Purpose |
|---|---|
| `tardiness-web-check-vX.Y.Z.zip` | The full app, ready to extract and run |
| `SHA256SUMS` | Checksum to verify the ZIP integrity |

### Verify a download

```bash
# macOS / Linux
shasum -a 256 tardiness-web-check-v1.0.0.zip
```

```powershell
# Windows PowerShell
Get-FileHash tardiness-web-check-v1.0.0.zip -Algorithm SHA256
```

Compare against the `SHA256SUMS` file in the release.

### How releases work

- **Triggered by** pushing a tag matching `v*` (e.g. `v1.0.0`)
- **Automated by** `.github/workflows/release.yml`
- **Steps**: tests run → distribution built → SHA-256 generated → GitHub Release created → ZIP + checksums attached
- **Manual trigger** available via the Actions tab → Release → Run workflow

For maintainers: see [`docs/RELEASING.md`](docs/RELEASING.md) for the full release process.

---

## 🧪 Development

### Running tests

```bash
npm test
```

Runs 112 backend tests in <5 seconds. Tests cover:
- Server lifecycle (startup, health, shutdown)
- Wizard flow (school → year → PIN → recovery)
- Students CRUD + search + class filter
- Tardiness events + late count
- PIN auth + recovery code
- Backup round-trip
- Import/export round-trip
- Audit log
- Middleware (request ID, native gzip compression, native security headers, native rate limit, error handling)

### Architecture decisions

| Decision | Why |
|---|---|
| **Node.js 22+** | LTS, runs on Windows / Mac / Linux / Raspberry Pi without changes |
| **`node:sqlite`** (built-in) | No native compilation (no VS Build Tools required). Same API as better-sqlite3. |
| **`node:crypto.scrypt`** (built-in) | Native, memory-hard PIN hashing. 30× faster than bcryptjs, no npm dep. Old bcrypt hashes still verify for backward compat. |
| **`xlsx`** (SheetJS) | Excel read/write without Microsoft Office |
| **Vanilla HTML + JS frontend** | No build step, no bundler, no framework. Loads instantly. |
| **SQLite** | Single file, no DB server, easy to back up (`xcopy`, `cp`, `rsync`) |
| **Native gzip + manual security headers + Map-based rate limit** | Production-grade security headers + 87% bandwidth savings on JSON payloads, all with zero dependencies |
| **Express 4** | Battle-tested, minimal, perfect for this use case |
| **No PWA, no SPA, no service worker** | Keeps it simple. Tablets just bookmark the URL. |

### Changing the port

The server defaults to **port 3000**. Three ways to change it (in priority order):

| Method | How | Best for |
|---|---|---|
| **Environment variable** | `set PORT=8080` then run `Start.bat` (Windows) / `PORT=8080 ./Start.command` (Mac) | Power users, one-off runs |
| **Edit `data/.port`** | Create `data/.port` containing just the port number (e.g. `8080`). See `data/.port.example` for instructions. | **Non-IT admins** — edit a text file, no terminal needed |
| **Default** | No config — uses 3000 | Out-of-the-box setup |

After editing `data/.port`, restart the server (`Ctrl+C` in the Start.bat window, then double-click again). The browser will open on the new port.

### Environment variables

All optional. The app works without any of these.

| Var | Default | What |
|---|---|---|
| `PORT` | `3000` (or `data/.port`) | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `production` hides error stacks in responses |
| `DB_PATH` | `data/tardiness.db` | SQLite file location |
| `RATE_LIMIT_GENERAL` | `600` | Reqs/15min per IP for non-PIN endpoints |
| `RATE_LIMIT_PIN` | `30` | Reqs/15min per IP for PIN-gated endpoints |
| `BODY_LIMIT` | `1mb` | Max request body size |
| `AUTO_BACKUP_ENABLED` | `true` | Enable daily 2 AM backup |
| `BACKUP_RETENTION_DAYS` | `30` | Delete backups older than this |

---

## 🆘 Troubleshooting

### "Node.js is not installed" when running Start.bat

Download and install Node.js 22 LTS from [nodejs.org](https://nodejs.org/). Use all default options. Restart your computer after installing.

### Browser doesn't open automatically

Open `http://localhost:3000` manually in any browser (Chrome, Firefox, Edge, Safari). If nothing loads, check the `Start.bat` console window for error messages.

### Tablet can't reach the server

1. Make sure the tablet is on the **same Wi-Fi network** as the server computer
2. Use the **Network URL** shown in the console (e.g. `http://192.168.1.42:3000`), not `localhost`
3. If still failing: open **Windows Defender Firewall** → **Advanced settings** → **Inbound Rules** → **New Rule** → Port → TCP 3000 → Allow

### Forgot the admin PIN

On the login screen, click **"Forgot PIN? Use recovery code"**. Enter the 16-character code (format `XXXX-XXXX-XXXX-XXXX`) you saved during setup. You'll be prompted to set a new PIN.

> **No recovery code?** You must restore from a backup, or have your IT support reset the database.

### "Get Help" — copy diagnostics to clipboard

On any page, click **Get Help** in the footer. This copies a complete report (version, database size, recent errors, audit log tail) to your clipboard. Paste it into a message to your IT contact — they have everything they need to help.

### Something else broken?

1. Check the **`Start.bat` console window** — error messages appear there
2. Click **Get Help** → paste the diagnostics
3. Check `data/backups/` for the most recent automatic backup (in case you need to restore)
4. Open an issue on [GitHub](https://github.com/richiesamlie/tardiness-web-check/issues) with the diagnostics attached

---

## 🔒 Security & Privacy

This is a **self-hosted** app. **All data stays on your school's network**. No cloud, no third-party access, no telemetry.

### What we do

| Layer | Measure |
|---|---|
| **Transport** | LAN-only by default. Server binds to all interfaces, but is not exposed to the internet unless you explicitly set up port forwarding. |
| **Auth** | PIN (4–8 digits), bcrypt-hashed, never stored in plaintext |
| **Recovery** | 16-character recovery code, hashed separately. Unambiguous alphabet (no 0/1/I/O confusion). |
| **Sessions** | PIN lives in `sessionStorage` only — cleared when browser tab closes |
| **Headers** | Helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| **Rate limit** | 600/15min general, 30/15min PIN-gated |
| **CSRF** | Same-origin only (CORS not enabled) |
| **Audit** | Every admin action logged with timestamp + IP + actor |
| **Backups** | `.zip` files include DB + config. Restore requires admin PIN. |
| **Error handling** | Stack traces hidden in production, request ID returned for traceability |

### What we don't do

- ❌ No cloud sync
- ❌ No analytics / telemetry
- ❌ No third-party APIs (no Google, no Firebase, no Sentry)
- ❌ No phone-home or "phone-home to check for updates"
- ❌ No telemetry on errors (but your "Get Help" includes a copy-paste for you to send)

---

## 🧭 Roadmap

### Shipped (v1.0)
- ✅ Wizard, login, mark-late, roster CRUD, reports, settings
- ✅ Excel + CSV import/export
- ✅ Auto-backup + manual backup + restore
- ✅ PIN auth + recovery code
- ✅ Audit log
- ✅ First-run wizard
- ✅ "Get Help" diagnostics
- ✅ 112 backend tests
- ✅ Modern UI (CSP, X-Frame-Options, request IDs, native gzip, rate limit)

### Planned (v2)
- 🔲 PWA (offline mode + add-to-home-screen)
- 🔲 Barcode / RFID scan-to-mark
- 🔲 WhatsApp parent notification on Nth late
- 🔲 Multi-school / multi-tenant
- 🔲 Year-end archive + new-year rollover wizard
- 🔲 Per-class timetable (auto-resolve "expected at" time)

### Considered (v3+)
- 🔲 Student/parent self-service portal (no PIN needed)
- 🔲 SMS notifications
- 🔲 Biometric check-in

---

## 📊 Project Stats

| Metric | Value |
|---|---|
| Lines of code | ~3,700 (backend + frontend) |
| **npm dependencies** | **5** runtime + 1 dev (was 10 — replaced 5 with native Node APIs) |
| Backend tests | 112 (Node native test runner, <5s) |
| Frontend pages | 6 (HTML) |
| CSS lines | ~840 |
| Frontend JS lines | ~600 |
| API endpoints | 27 across 9 routers |
| Database tables | 4 (students, tardiness_events, config, audit_log) |
| External services | 0 |
| Native APIs used | `node:sqlite`, `node:crypto.scrypt`, `node:zlib`, `node:http`, `node:fs`, `node:timers` |
| Minimum Node.js | 22 (LTS) |
| License | MIT |

---

## 📝 License

MIT — see the [LICENSE](LICENSE) file. Free to use, modify, and distribute. No warranty.

---

## 🙏 Credits

Built with care for school admin staff who shouldn't need IT support to do their job.

**Tech stack:** Node.js · Express · SQLite (built-in `node:sqlite`) · SheetJS · `node:crypto.scrypt` · `node:zlib` · archiver · plain HTML/CSS/JS.

Originally built for **Elyon Christian Primary School (Jakarta)**. General-purpose for any primary or secondary school.

---

## 🤝 Contributing

Issues and PRs welcome at [github.com/richiesamlie/tardiness-web-check](https://github.com/richiesamlie/tardiness-web-check).

When reporting a bug, please include the output of the **Get Help** button (Settings → Get Help → Copy).

When proposing a feature, please describe:
- **Who** benefits (gate staff? admin? parent? student?)
- **What** the feature does
- **Why** it's worth the maintenance cost (this app optimizes for "no maintenance")

---

## 📞 Support

1. Click **Get Help** in the app footer → paste the report
2. Check the [Troubleshooting](#-troubleshooting) section above
3. Search [GitHub Issues](https://github.com/richiesamlie/tardiness-web-check/issues)
4. Open a new issue with the diagnostics attached

**Made with ❤️ for schools that just want things to work.**
