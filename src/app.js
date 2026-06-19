// Express application factory.
// Wires up all middleware in the correct order, then mounts routes,
// then the 404 handler, then the global error handler.

'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const { createYearHelper } = require('./lib/year');
const backupLib = require('./lib/backup');

const requestId = require('./middleware/requestId');
const logger = require('./middleware/logger');
const security = require('./middleware/security');
const compressionMw = require('./middleware/compression');
const rateLimit = require('./middleware/rateLimit');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const studentsRouter = require('./routes/students');
const tardinessRouter = require('./routes/tardiness');
const statsRouter = require('./routes/stats');
const configRouter = require('./routes/config');
const wizardRouter = require('./routes/wizard');
const dataRouter = require('./routes/data');
const backupRouter = require('./routes/backup');
const diagnosticsRouter = require('./routes/diagnostics');

function createApp({ db = null, dbPath = null } = {}) {
  const app = express();
  const startedAt = Date.now();

  app.locals.db = db;
  app.locals.dbPath = dbPath || (db && db.name && db.name !== ':memory:' ? db.name : null);
  app.locals.getCurrentAcademicYear = createYearHelper(db);
  app.locals.startedAt = startedAt;

  // Trust proxy when configured (for correct client IPs behind a reverse proxy)
  if (config.trustProxy) app.set('trust proxy', 1);

  // === Middleware order matters ===
  // 1. Request ID first so every other layer can use it
  app.use(requestId());
  // 2. Security headers (helmet)
  app.use(security());
  // 3. Gzip compression
  app.use(compressionMw());
  // 4. Request logger (skips /api/health)
  app.use(logger());
  // 5. General rate limit
  app.use('/api', rateLimit.general());
  // 6. JSON body parser with size cap
  app.use(express.json({ limit: config.jsonBodyLimit }));

  // === Routes ===
  app.use('/api/students', studentsRouter);
  app.use('/api/tardiness', tardinessRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/wizard', wizardRouter);
  app.use('/api', dataRouter);
  app.use('/api', backupRouter);
  app.use('/api', diagnosticsRouter);

  // Static files (frontend)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Default route → wizard if not done, tardiness check otherwise
  app.get('/', (req, res) => {
    if (db) {
      try {
        const completed = db.prepare("SELECT value FROM config WHERE key = 'wizard_completed'").get();
        if (!completed) return res.redirect('/wizard.html');
      } catch { /* fall through */ }
    }
    res.redirect('/index.html');
  });

  // Health endpoint — deeper checks than just "alive"
  app.get('/api/health', (req, res) => {
    const body = {
      ok: true,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      app_version: config.appVersion,
      node_env: config.nodeEnv,
    };
    if (db) {
      let sizeBytes = 0;
      try {
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) sizeBytes = fs.statSync(pragma.file).size;
      } catch { /* :memory: or db closed */ }
      body.db = { size_bytes: sizeBytes };

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

  // 404 (no route matched) — must come AFTER all routes
  app.use(notFound());
  // Global error handler — must come LAST
  app.use(errorHandler());

  return app;
}

module.exports = { createApp };
