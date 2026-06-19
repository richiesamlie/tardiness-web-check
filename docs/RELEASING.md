# Releasing Tardiness Web Check

This document explains how to create a new release. End users don't need to read this — they just download the ZIP from [Releases](https://github.com/richiesamlie/tardiness-web-check/releases).

## 📋 Overview

The release process is **fully automated** via GitHub Actions. You just:

1. Bump the version in `package.json`
2. Commit + push to `main`
3. Create a git tag (`vX.Y.Z`)
4. Push the tag
5. GitHub Actions builds, tests, and publishes the release automatically

## 🔄 Standard Release

### One-time setup

Make sure you have:
- Push access to the repo
- GitHub CLI installed and authenticated (`gh auth status`)
- Node.js 22+ locally for dry-run

### Steps

```bash
# 1. Make sure you're on main with a clean tree
git checkout main
git pull
git status   # should show "nothing to commit, working tree clean"

# 2. Run the test suite (sanity check)
npm test

# 3. Bump the version (choose one)
# Patch (1.0.0 → 1.0.1) — bug fixes
# Minor (1.0.0 → 1.1.0) — new features, backwards-compatible
# Major (1.0.0 → 2.0.0) — breaking changes
npm version patch   # or minor, or major

# This automatically:
# - Updates package.json
# - Creates a commit like "1.0.1"
# - Creates a tag like "v1.0.1"

# 4. Push both the commit and the tag
git push origin main --follow-tags

# 5. Watch the release workflow
gh run watch

# 6. Verify the release appeared
gh release view v1.0.1 --web
```

That's it. The CI will:
1. ✅ Run all 112 tests on Node 22 + 24
2. ✅ Build the distribution ZIP
3. ✅ Generate SHA-256 checksums
4. ✅ Create a GitHub Release with auto-generated notes
5. ✅ Attach the ZIP and checksums

## 🧪 Manual Workflow (no tag)

You can also trigger the release workflow manually via the GitHub UI:

1. Go to **Actions** → **Release** → **Run workflow**
2. Enter the version (e.g. `v1.0.1`)
3. Click **Run workflow**

The workflow does the same things; it just gets the version from the input instead of the tag.

## 🔍 Pre-release Checks (local)

Before bumping the version, run these locally:

```bash
# 1. Tests pass
npm test

# 2. Build works (smoke test)
npm run build

# 3. Version is valid semver
npm run version:check

# 4. Dry-run a release build with a fake version
npm run release:dry
# → creates dist/tardiness-web-check-v9.9.9.zip
```

## 🏷️ Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (`2.0.0`) — breaking changes (e.g. DB schema change that requires migration)
- **MINOR** (`1.1.0`) — new features, backwards-compatible
- **PATCH** (`1.0.1`) — bug fixes, backwards-compatible

Pre-release versions (e.g. `v1.1.0-rc.1`) are tagged as pre-release on GitHub and don't get marked as "latest".

## 📦 What Gets Built

The distribution ZIP includes:

```
tardiness-web-check-v1.0.0/
├── README.md              ← user-facing instructions
├── LICENSE                ← MIT
├── package.json           ← dependencies
├── package-lock.json      ← exact pinned versions
├── VERSION.json           ← build metadata
├── Start.bat              ← Windows launcher
├── Start.command          ← macOS launcher
├── Install-Service.bat    ← Windows auto-start
├── Uninstall-Service.bat
├── src/                   ← server code
├── public/                ← frontend
├── docs/                  ← documentation
└── scripts/
    └── capture-screenshots.js
```

**Excluded** (not in ZIP):
- `.git/` (version control)
- `node_modules/` (users run `npm install` themselves)
- `data/` (their data, not ours)
- `dist/` (build output)
- `tmp/`, `coverage/`, `screenshots/debug-*.png`
- `test/` (dev only)
- `.github/` (CI config)

## 🔐 Checksum Verification

Every release includes a `SHA256SUMS` file. End users can verify:

**Windows (PowerShell):**
```powershell
Get-FileHash tardiness-web-check-v1.0.0.zip -Algorithm SHA256
```

**macOS / Linux:**
```bash
shasum -a 256 tardiness-web-check-v1.0.0.zip
```

Compare to the SHA-256 in the GitHub release and the `SHA256SUMS` file.

## 🚨 Hotfix Release

For urgent bug fixes, you can release directly from a branch:

```bash
git checkout hotfix-fix-something
# ... fix the bug ...
npm test
npm version patch
git push origin hotfix-fix-something --follow-tags
# Then merge back to main and tag there too
```

The release workflow triggers on any `v*` tag, regardless of branch.

## 🐛 Rolling Back a Bad Release

If a release is broken, you can't delete the tag (GitHub keeps it for security), but you can:

1. **Mark as pre-release/draft** to hide it from "latest":
   ```bash
   gh release edit v1.0.1 --prerelease
   ```

2. **Cut a patch release immediately:**
   ```bash
   # Fix the bug
   git checkout main
   # ... fix ...
   npm version patch   # 1.0.1 → 1.0.2
   git push origin main --follow-tags
   ```

3. **Delete the ZIP asset** (without deleting the release):
   - Go to the release page → edit → delete the broken ZIP

## 🆘 Troubleshooting

### "package.json version does not match tag"

The `npm version` command updates `package.json` AND creates the tag in one step. If you created the tag manually, you must also update `package.json`:

```bash
# Fix: sync package.json with the tag
git tag -d v1.0.1
npm version patch
git push origin main --follow-tags
```

### Workflow doesn't trigger

Check the tag format — it must start with `v`:

```bash
git tag                                  # list tags
git tag -d 1.0.1                         # delete wrong tag
git tag v1.0.1                           # recreate with 'v' prefix
git push origin v1.0.1 --follow-tags     # push
```

### Tests fail in CI but pass locally

- Make sure you ran `npm ci` (not `npm install`)
- Check Node version: `node --version` must be 22+
- Check the [CI workflow logs](https://github.com/richiesamlie/tardiness-web-check/actions)

## 📞 Support

Issues with the release process? Open a GitHub issue or contact maintainers.
