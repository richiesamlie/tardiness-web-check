#!/usr/bin/env node
// Build a clean distribution ZIP for end-users (schools) to download.
// Excludes dev-only files: .git, node_modules, data, screenshots/debug, tests, etc.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PKG = require(path.join(ROOT, 'package.json'));
const VERSION = process.env.RELEASE_VERSION || PKG.version;
const APP_NAME = PKG.name; // e.g. "tardiness-web-check"
const DIST_DIR = path.join(ROOT, 'dist');
const ZIP_NAME = `${APP_NAME}-v${VERSION}.zip`;
const ZIP_PATH = path.join(DIST_DIR, ZIP_NAME);

// Files and directories to include in the distribution
const INCLUDE = [
  'package.json',
  'package-lock.json',
  'README.md',
  'LICENSE',
  'Start.bat',
  'Start.command',
  'Install-Service.bat',
  'Uninstall-Service.bat',
  'src',
  'public',
  'docs',
  'scripts/capture-screenshots.js', // optional helper for admins
];

// Explicit excludes (in addition to defaults)
const EXCLUDE_PATTERNS = [
  /^\.git($|\/)/,
  /^node_modules($|\/)/,
  /^data($|\/)/,
  /^dist($|\/)/,
  /^tmp($|\/)/,
  /^coverage($|\/)/,
  /^screenshots\/debug-/,
  /\.log$/,
  /^\.env/,
  /^test($|\/)/,
  /^\.github($|\/)/,
];

function shouldExclude(relPath) {
  return EXCLUDE_PATTERNS.some(re => re.test(relPath));
}

function shouldInclude(name) {
  // Match top-level entries from INCLUDE
  return INCLUDE.some(entry => {
    if (entry === name) return true;
    // Allow entry/ for directories
    if (entry.startsWith(name + '/')) return true;
    return false;
  });
}

async function build() {
  // Ensure dist directory exists
  await fs.promises.mkdir(DIST_DIR, { recursive: true });

  const output = fs.createWriteStream(ZIP_PATH);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', async () => {
      const sizeBytes = archive.pointer();
      // Compute SHA-256 of the finished file on disk
      const fileBuffer = await fs.promises.readFile(ZIP_PATH);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      console.log('');
      console.log(`✓ Built ${ZIP_NAME}`);
      console.log(`  Size:       ${(sizeBytes / 1024).toFixed(1)} KB (${sizeBytes.toLocaleString()} bytes)`);
      console.log(`  Path:       ${ZIP_PATH}`);
      console.log(`  SHA-256:    ${sha256}`);
      resolve({ zipPath: ZIP_PATH, zipName: ZIP_NAME, sizeBytes, sha256 });
    });
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn('  ⚠', err.message);
      else reject(err);
    });

    archive.pipe(output);

    // Add files
    let fileCount = 0;
    function addDir(dir, prefix = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const absPath = path.join(dir, entry.name);
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (shouldExclude(relPath)) continue;
        if (entry.isDirectory()) {
          addDir(absPath, relPath);
        } else if (entry.isFile()) {
          archive.file(absPath, { name: `${APP_NAME}-v${VERSION}/${relPath}` });
          fileCount++;
        }
      }
    }

    for (const name of INCLUDE) {
      const absPath = path.join(ROOT, name);
      if (!fs.existsSync(absPath)) {
        console.warn(`  ⚠ Skipping missing: ${name}`);
        continue;
      }
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) {
        addDir(absPath, name);
      } else {
        archive.file(absPath, { name: `${APP_NAME}-v${VERSION}/${name}` });
        fileCount++;
      }
    }

    // Add a VERSION file with the release info
    const versionInfo = JSON.stringify({
      name: APP_NAME,
      version: VERSION,
      built_at: new Date().toISOString(),
      node_required: PKG.engines?.node || '>=22.5.0',
      commit: process.env.GITHUB_SHA || 'local',
    }, null, 2);
    archive.append(versionInfo, { name: `${APP_NAME}-v${VERSION}/VERSION.json` });

    console.log(`Building ${ZIP_NAME} from ${fileCount} files...`);
    archive.finalize();
  });
}

// CLI usage:  node scripts/build-release.js
if (require.main === module) {
  build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
}

module.exports = { build };
