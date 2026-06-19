const path = require('node:path');
const os = require('node:os');
const { createApp } = require('./app');
const { createDb } = require('./db');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tardiness.db');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const db = createDb({ path: DB_PATH });
const app = createApp({ db });

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Tardiness Check server running');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${getLanIp()}:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  server.close(() => {
    try { db.close(); } catch { /* already closed */ }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, db, server };
