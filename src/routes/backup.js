const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const backup = require('../lib/backup');
const { log } = require('../lib/audit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/backups — list all backups in folder
router.get('/backups', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const folder = backup.getBackupFolder(db);
  res.json({ folder, backups: backup.listBackups(folder) });
});

// POST /api/backup — create backup, save to folder, AND download
router.post('/backup', requirePin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const dbPath = req.app.locals.dbPath;
    const folder = backup.getBackupFolder(db);
    const result = await backup.createBackup(db, dbPath, { saveToFolder: folder });
    const filename = result.savedPath ? require('node:path').basename(result.savedPath)
      : `tardiness-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Type', 'application/zip');
    res.send(result.buffer);
  } catch (e) { next(e); }
});

// POST /api/restore — upload backup zip
router.post('/restore', requirePin, upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const dbPath = req.app.locals.dbPath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file is required (multipart/form-data, field "file")' });
    }
    const result = await backup.restoreBackup(db, dbPath, req.file.buffer);
    res.json({
      ok: true,
      ...result,
      restart_required: true,
      restart_message: 'Restart the server (Start.bat / Install-Service will auto-restart) for the restored data to take effect.',
    });
  } catch (e) {
    log(db, { action: 'restore.failed', details: { error: e.message } });
    res.status(400).json({ error: `restore failed: ${e.message}` });
  }
});

// DELETE /api/backups/:filename — delete a backup file (with path-traversal protection)
router.delete('/backups/:filename', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const folder = backup.getBackupFolder(db);
  const filename = req.params.filename;

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  if (!filename.startsWith('tardiness-backup-') && !filename.startsWith('pre-restore-')) {
    return res.status(400).json({ error: 'invalid filename — only backup files can be deleted' });
  }

  const fullPath = path.join(folder, filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'not found' });

  fs.unlinkSync(fullPath);
  log(db, { action: 'backup.deleted', details: { filename } });
  res.json({ ok: true });
});

// POST /api/restart — graceful exit (service manager restarts, or admin runs Start.bat)
router.post('/restart', requirePin, (req, res) => {
  const db = req.app.locals.db;
  log(db, { action: 'server.restart_requested' });
  res.json({ ok: true, message: 'restarting in 1 second' });
  setTimeout(() => process.exit(0), 1000);
});

module.exports = router;
