const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const { PassThrough } = require('node:stream');
const { log } = require('./audit');
const { get } = require('./config');

// Safe log: tolerate closed/missing db
function safeLog(db, entry) {
  try { log(db, entry); } catch { /* db may be closed during restore */ }
}

const APP_VERSION = require('../../package.json').version;
const SCHEMA_VERSION = 1;
const KEEP_DAYS = 30;

function getDbPath(db) {
  if (!db) return null;
  try {
    const pragma = db.prepare('PRAGMA database_list').get();
    return pragma?.file || null;
  } catch { return null; }
}

function getBackupFolder(db) {
  const configured = get(db, 'backup_folder');
  if (configured) return configured;
  // Default: data/backups/ relative to the DB file location (or CWD for :memory:)
  const dbPath = getDbPath(db);
  if (dbPath) return path.join(path.dirname(dbPath), 'backups');
  return path.join(process.cwd(), 'data', 'backups');
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function createBackup(db, dbPath, { saveToFolder = null } = {}) {
  // WAL checkpoint: flush pending writes into main DB before copying
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* best-effort */ }

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

  safeLog(db, {
    action: savedPath ? 'backup.saved' : 'backup.created',
    details: savedPath ? { filename: path.basename(savedPath), bytes: buf.length } : { bytes: buf.length },
  });
  return { buffer: buf, savedPath };
}

function listBackups(folder) {
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter(f => (f.startsWith('tardiness-backup-') || f.startsWith('pre-restore-')) && f.endsWith('.zip'))
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

async function restoreBackup(db, dbPath, buffer) {
  // Validate: open zip and check for expected files
  const directory = await unzipper.Open.buffer(buffer);
  const entries = directory.files.map(f => f.path);
  if (!entries.includes('tardiness.db') || !entries.includes('meta.json')) {
    throw new Error('Invalid backup: missing tardiness.db or meta.json');
  }

  // Validate meta.json
  const metaEntry = directory.files.find(f => f.path === 'meta.json');
  const metaBuf = await metaEntry.buffer();
  let meta;
  try { meta = JSON.parse(metaBuf.toString('utf8')); }
  catch { throw new Error('Invalid backup: meta.json is not valid JSON'); }
  if (typeof meta.schema_version !== 'number') {
    throw new Error('Invalid backup: meta.json missing schema_version');
  }

  // Safety: back up current DB before overwriting
  const folder = path.dirname(dbPath);
  const preFolder = path.join(folder, 'backups');
  fs.mkdirSync(preFolder, { recursive: true });
  const preFilename = `pre-restore-${timestamp()}.zip`;
  await createBackup(db, dbPath, { saveToFolder: preFolder });
  // Rename the auto-generated filename to pre-restore-*
  // Easier: just call createBackup again with the pre-restore naming by passing a custom folder/file?
  // Simpler: after createBackup, find the latest and rename.
  const recent = listBackups(preFolder).find(b => b.filename.startsWith('tardiness-backup-'));
  let prePath = null;
  if (recent) {
    prePath = path.join(preFolder, preFilename);
    fs.renameSync(path.join(preFolder, recent.filename), prePath);
  }

  // Extract the DB entry
  const dbEntry = directory.files.find(f => f.path === 'tardiness.db');
  const dbBuf = await dbEntry.buffer();

  // Close current DB connection
  db.close();
  // Remove old DB files
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext;
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch { /* skip */ }
    }
  }
  // Write restored DB
  fs.writeFileSync(dbPath, dbBuf);

  safeLog(db, {
    action: 'restore.completed',
    details: {
      schema_version: meta.schema_version,
      pre_restore: prePath,
      app_version_restored_from: meta.app_version,
    },
  });
  return {
    preRestorePath: prePath,
    restoredFromVersion: meta.app_version,
    schemaVersion: meta.schema_version,
    needsRestart: true,
  };
}

module.exports = {
  createBackup, restoreBackup, listBackups, pruneOldBackups,
  getLastBackupTime, getDiskFreeBytes, getBackupFolder,
  APP_VERSION, SCHEMA_VERSION,
};
