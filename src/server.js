// Server entry point.
// Boots the DB + app, starts the HTTP server, and handles graceful shutdown.

'use strict';

const path = require('node:path');
const os = require('node:os');

const config = require('./config');
const { createApp } = require('./app');
const { createDb } = require('./db');
const { startBackupScheduler } = require('./lib/scheduler');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function boot() {
  const db = createDb({ path: config.dbPath });
  const app = createApp({ db, dbPath: config.dbPath });

  const server = app.listen(config.port, config.host, () => {
    console.log('');
    console.log('  Tardiness Check server running');
    console.log(`  Local:    http://localhost:${config.port}`);
    console.log(`  Network:  http://${getLanIp()}:${config.port}`);
    console.log(`  Database: ${config.dbPath}`);
    console.log(`  Env:      ${config.nodeEnv}  (v${config.appVersion})`);
    console.log('');
    startBackupScheduler(db, config.dbPath);
  });

  // Per-request timeout (default 30s)
  server.setTimeout(config.requestTimeoutMs);
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.requestTimeoutMs + 5000;  // headers must come in within timeout+5s

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) {
      console.log(`  already shutting down, ignoring ${signal}`);
      return;
    }
    shuttingDown = true;
    console.log(`\n  Received ${signal}, shutting down gracefully...`);

    // Hard deadline — force exit after 10s
    const hardKill = setTimeout(() => {
      console.error('  Shutdown timeout exceeded, forcing exit.');
      process.exit(1);
    }, 10_000);
    hardKill.unref();

    // Stop accepting new connections, then drain
    server.close((err) => {
      if (err) console.error('  server close error:', err);
      try { db.close(); } catch (e) { /* already closed */ }
      console.log('  Bye!');
      process.exit(err ? 1 : 0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });

  return { app, db, server };
}

if (require.main === module) {
  boot();
}

module.exports = { boot, getLanIp };
