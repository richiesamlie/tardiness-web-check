# Tardiness Check

Self-hosted tardiness tracking for schools. Search-and-tap "mark late" for gate staff, roster/reports/settings for non-IT admins. CSV + XLSX import/export, auto-backup, demo mode, audit log, "Get Help" diagnostics.

- **Master plan:** `C:\Users\dewa5\tardiness-app-PLAN.md`
- **Implementation plan:** `docs/plans/IMPLEMENTATION_PLAN.md`

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

## Requirements

- **Node.js ≥ 22.5** (we use built-in `node:sqlite`)
- That's it. No Visual Studio Build Tools, no native compilation.

## Project Structure

```
tardiness-app/
├── src/
│   ├── server.js        # entry point
│   ├── app.js           # express app factory
│   ├── routes/          # (phases 1+)
│   └── lib/             # (phases 4+)
├── public/              # static client (phases 9+)
├── test/                # node:test specs
├── data/                # SQLite DB lives here (gitignored)
└── docs/plans/          # implementation plan
```

## Status

🚧 **Phase 0 complete** — Express skeleton boots, `/api/health` works, 1 test passing.

See `docs/plans/IMPLEMENTATION_PLAN.md` for the full roadmap.
