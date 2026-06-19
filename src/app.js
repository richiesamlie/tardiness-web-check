const express = require('express');
const fs = require('node:fs');
const studentsRouter = require('./routes/students');
const tardinessRouter = require('./routes/tardiness');
const statsRouter = require('./routes/stats');
const configRouter = require('./routes/config');
const wizardRouter = require('./routes/wizard');
const dataRouter = require('./routes/data');
const { createYearHelper } = require('./lib/year');

function createApp({ db = null } = {}) {
  const app = express();
  const startedAt = Date.now();
  app.locals.db = db;
  app.locals.getCurrentAcademicYear = createYearHelper(db);

  app.use(express.json());
  app.use('/api/students', studentsRouter);
  app.use('/api/tardiness', tardinessRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/config', configRouter);
  app.use('/api/wizard', wizardRouter);
  app.use('/api', dataRouter);

  app.get('/api/health', (req, res) => {
    const body = { ok: true, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) };
    if (db) {
      let sizeBytes = 0;
      try {
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) sizeBytes = fs.statSync(pragma.file).size;
      } catch { /* :memory: */ }
      body.db = { sizeBytes };
    }
    res.json(body);
  });

  return app;
}

module.exports = { createApp };
