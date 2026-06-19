const os = require('node:os');
const { createApp } = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = createApp();
const server = app.listen(PORT, HOST, () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('  Tardiness Check server running');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${lanIp}:${PORT}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
