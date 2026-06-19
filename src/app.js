const express = require('express');

function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp };
