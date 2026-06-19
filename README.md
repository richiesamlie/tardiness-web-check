# Tardiness Check

A self-hosted, single-folder web app for tracking student tardiness. Built for schools that want something simple, private, and easy to operate without IT staff.

- ✅ **One server, one folder** — no cloud, no Docker, no complex setup
- ✅ **Search-and-tap** workflow for gate staff (under 5 seconds per mark)
- ✅ **CSV + Excel** import/export
- ✅ **Auto-backup daily** + one-click restore
- ✅ **Plain English** UI, designed for non-IT admins
- ✅ **Built-in diagnostics** ("Get Help" copies everything support needs)

> Built for Elyon Christian Primary School (Jakarta). General-purpose for any primary/secondary school.

---

## 🚀 Quick Start (Windows)

1. **Install Node.js** (one-time, takes 2 min):
   - Go to <https://nodejs.org/>
   - Download the **LTS** version (Node 22 or later)
   - Run the installer with all default options

2. **Start the app**:
   - Double-click **`Start.bat`**
   - Browser opens automatically at `http://localhost:3000`

3. **First-run setup** (4 screens, ~2 minutes):
   - Enter your school name
   - Pick the academic year (e.g. `2025/2026`)
   - Create a 4–8 digit admin PIN
   - **Save the recovery code** somewhere safe (write it down or print it)

4. **Add students** — either:
   - Click "+ Add student" for one at a time, or
   - Click "Import" → download template → fill in Excel → upload

That's it. The server runs in the Start.bat window — close that window to stop.

## 🚀 Quick Start (macOS)

1. Install Node.js from <https://nodejs.org/> (LTS, v22+)
2. Double-click **`Start.command`**
3. First browser may take 10 seconds to open; allow it in System Settings if prompted

## 🚀 Quick Start (Linux)

```bash
node --version   # need v22+
npm start        # or: ./Start.command after chmod +x
```

Then open `http://localhost:3000`.

---

## 📱 Using the App

### For gate staff (no PIN needed)
1. Open `http://<server-ip>:3000` on the tablet
2. Type a student's name or ID
3. Tap their name → confirm "Mark late at 09:42?"
4. Done. The student is logged with timestamp.

### For admins (PIN required)
Click **Roster**, **Reports**, or **Settings** in the top navigation. Enter your 6-digit PIN when prompted.

### On a tablet at the gate
- Add to Home Screen (iOS Safari / Android Chrome) → opens full-screen
- Or bookmark the URL

---

## 🛠️ Auto-Start on Boot (Windows)

Run **`Install-Service.bat`** once. The app will start automatically every time you log in to Windows. Run **`Uninstall-Service.bat`** to remove.

---

## 🌐 Accessing from Other Devices (Tablet, Phone)

When the server starts, it shows your LAN IP:

```
  Tardiness Check server running
  Local:   http://localhost:3000
  Network: http://192.168.1.42:3000     ← use this on tablets/phones
```

Type the "Network" URL on the tablet's browser. They must be on the same Wi-Fi network.

**Firewall tip (Windows):** if the tablet can't connect, allow Node.js through Windows Firewall when prompted, or manually add a rule for port 3000.

---

## 📁 Project Structure

```
tardiness-app/
├── Start.bat              ← double-click entry (Windows)
├── Start.command          ← macOS entry
├── Install-Service.bat    ← auto-start on Windows logon
├── Uninstall-Service.bat  ← remove auto-start
├── package.json
├── README.md
├── LICENSE
├── src/
│   ├── server.js          ← entry point
│   ├── app.js             ← Express app factory
│   ├── db.js              ← SQLite setup + schema
│   ├── routes/            ← API endpoints (students, tardiness, config, wizard, data, backup, diagnostics)
│   └── lib/               ← helpers (config, pin, audit, backup, xlsx, time, year, scheduler)
├── public/                ← frontend (HTML + CSS + vanilla JS)
│   ├── index.html         ← Mark Late (gate staff)
│   ├── wizard.html        ← First-run setup
│   ├── login.html         ← PIN entry
│   ├── roster.html        ← Student management
│   ├── reports.html       ← Stats and reports
│   ├── settings.html      ← Admin settings
│   ├── css/style.css
│   └── js/common.js
├── test/                  ← 93 backend tests (Node native test runner)
├── data/
│   ├── tardiness.db       ← your data (gitignored)
│   └── backups/           ← automatic daily backups (gitignored)
└── docs/
    ├── tardiness-app-PLAN.md         ← master spec
    ├── IMPLEMENTATION_PLAN.md        ← phased build plan
    └── VIDEO_SCRIPT.md               ← walkthrough video script
```

---

## 🧪 Development

```bash
npm test           # run 93 backend tests
npm start          # start the server
npm run dev        # start with --watch (auto-restart on file change)
```

### Architecture

- **Backend:** Node.js (≥22.5) + Express + `better-sqlite3` (no native compilation needed — uses built-in `node:sqlite`)
- **Frontend:** Plain HTML + vanilla JS + small CSS file. No build step, no framework, no bundler.
- **Storage:** Single SQLite file at `data/tardiness.db`. Backup-friendly.
- **No external dependencies at runtime** — works fully offline on the LAN.

### Tests

```bash
npm test
```

93 tests covering all API endpoints, PIN auth, wizard flow, backup round-trip, import/export, audit log, and diagnostics.

---

## 🆘 Troubleshooting

### "Node.js is not installed" when running Start.bat
Install Node.js 22 LTS from <https://nodejs.org/>.

### Browser doesn't open automatically
Open `http://localhost:3000` manually. If nothing loads, check the Start.bat console for errors.

### Tablet can't reach the server
- Make sure the tablet is on the same Wi-Fi network as the server
- Check Windows Firewall isn't blocking Node.js (you'll get a popup the first time)
- Try the LAN IP shown in the Start.bat console instead of `localhost`

### Forgot PIN
On the login screen, click **"Forgot PIN? Use recovery code"**. Enter your 16-character recovery code (XXXX-XXXX-XXXX-XXXX) and choose a new PIN.

**No recovery code?** Contact your IT support — they'll need to reset the database from a backup.

### Something is broken
On any page, click **"Get Help"** in the footer. This copies a complete diagnostics report to your clipboard. Paste it into a message to your IT contact — it includes version info, database size, and recent activity.

---

## 📊 Features

### Core (v1)
- Mark student late (search + tap, ~5 seconds)
- Student roster with search + class filter
- Daily auto-backup (2 AM) + manual backup/restore
- CSV + XLSX import/export with 2-step preview → apply
- Reports: today, this week, per-class breakdown, top offenders
- PIN-protected admin area
- Recovery code (in case of forgotten PIN)
- Audit log of every admin action
- "Get Help" → copy diagnostics
- First-run wizard (4 screens, no manual needed)
- Plain English UI (no jargon)

### Keyboard shortcuts
- `/` — focus search (on Tardiness Check page)
- `Esc` — close any open modal
- `Enter` — confirm the highlighted result

### Roadmap (v2+)
- Barcode/RFID scan-to-mark
- WhatsApp parent notification on Nth late
- Multi-school / multi-tenant
- PWA install (offline mode)
- Biometric / RFID check-in

---

## 🔒 Security & Privacy

- All data stays on your school network — no cloud, no third-party access
- Admin PIN is bcrypt-hashed; recovery code is hashed separately
- "Mark Late" requires no PIN (intentional — gate staff just need to scan/tap quickly)
- Roster/Reports/Settings require the admin PIN
- Every admin action is logged in the audit log with timestamp + IP
- Change PIN anytime from **Settings** (using your recovery code)
- Backups include everything (DB + config + audit log); restore requires admin PIN

---

## 📝 License

MIT License — see `LICENSE` file. Free to use, modify, and distribute.

---

## 🙏 Credits

Built with care for school admin staff who shouldn't need IT support to do their job.

**Tech stack:** Node.js · Express · SQLite · SheetJS · bcryptjs · plain HTML/CSS/JS.

**Total project size:** ~3,200 lines of code, 93 backend tests, 6 frontend pages, 27 API endpoints.
