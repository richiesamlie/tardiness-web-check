const express = require('express');
const fs = require('node:fs');
const studentsRouter = require('./routes/students');
const tardinessRouter = require('./routes/tardiness');
const statsRouter = require('./routes/stats');
const configRouter = require('./routes/config');
const wizardRouter = require('./routes/wizard');
const dataRouter = require('./routes/data');
const backupRouter = require('./routes/backup');
const { createYearHelper } = require('./lib/year');
const backupLib = require('./lib/backup');

function createApp({ db = null, dbPath = null } = {}) {
  const app = express();
  const startedAt = Date.now();
  app.locals.db = db;
  app.locals.dbPath = dbPath || (db && db.name && db.name !== ':memory:' ? db.name : null);
  app.locals.getCurrentAcademicYear = createYearHelper(db);

  app.use(express.json());
  app.use('/api/students', studentsRouter);
  app.use('/api/tardiness', tardinessRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/wizard', wizardRouter);
  app.use('/api', dataRouter);
  app.use('/api', backupRouter);

  app.get('/api/health', (req, res) => {
    const body = { ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) };
    if (db) {
      let sizeBytes = 0;
      try {
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) sizeBytes = fs.statSync(pragma.file).size;
      } catch { /* :memory: or db closed */ }
      body.db = { sizeBytes };

      try {
        const folder = backupLib.getBackupFolder(db);
        const last = backupLib.getLastBackupTime(folder);
        const count = backupLib.listBackups(folder).length;
        const free = backupLib.getDiskFreeBytes(folder);
        body.backup = {
          folder,
          last_backup: last,
          backup_count: count,
          disk_free_bytes: free,
        };
      } catch { /* no backup status */ }
    }
    res.json(body);
  });

  // Global JSON error handler (so unhandled errors return JSON, not HTML)
  app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    if (res.headersSent) return next(err);
    res.status(500).json({
      error: err.message || 'internal server error',
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    });
  });

  return app;
}

module.exports = { createApp };
