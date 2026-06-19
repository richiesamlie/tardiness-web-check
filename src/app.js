const express = require('express');
const fs = require('node:fs');

function createApp({ db = null } = {}) {
  const app = express();
  const startedAt = Date.now();
  app.locals.db = db;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    const body = {
      ok: true,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
    if (db) {
      let sizeBytes = 0;
      try {
        const pragma = db.prepare('PRAGMA database_list').get();
        if (pragma && pragma.file) {
          const stat = fs.statSync(pragma.file);
          sizeBytes = stat.size;
        }
      } catch { /* ignore — :memory: db has no file */ }
      body.db = { sizeBytes };
    }
    res.json(body);
  });

  return app;
}

module.exports = { createApp };
