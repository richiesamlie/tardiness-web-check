// Centralized config loader.
// Reads once at startup; can be overridden via (in priority order):
//   1. Environment variable  (e.g. PORT=8080 node src/server.js)
//   2. data/.port file       (e.g. "8080" — edit-friendly for non-IT admins)
//   3. Built-in default
// No secrets live here — for v1, everything is local & non-secret.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseInt10(value, def) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : def;
}

function parseBool(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  const s = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return def;
}

// Read port from env var, then data/.port file, then default.
// data/.port is the user-friendly knob for non-IT admins — see data/.port.example.
function resolvePort() {
  if (process.env.PORT) return parseInt10(process.env.PORT, 3000);
  try {
    const portFile = path.join(__dirname, '..', 'data', '.port');
    if (fs.existsSync(portFile)) {
      const contents = fs.readFileSync(portFile, 'utf8').trim();
      const n = parseInt(contents, 10);
      if (Number.isFinite(n) && n > 0 && n < 65536) return n;
    }
  } catch { /* ignore — fall through to default */ }
  return 3000;
}

const config = {
  // Server
  port: resolvePort(),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Storage
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tardiness.db'),

  // Request limits
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
  uploadLimit: process.env.UPLOAD_LIMIT || '20mb',
  requestTimeoutMs: parseInt10(process.env.REQUEST_TIMEOUT_MS, 30_000),

  // Security
  trustProxy: parseBool(process.env.TRUST_PROXY, false),
  rateLimitWindowMs: parseInt10(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60_000),  // 15 min
  rateLimitMax: parseInt10(process.env.RATE_LIMIT_MAX, 600),                      // 600 req / 15 min / IP
  pinRateLimitMax: parseInt10(process.env.PIN_RATE_LIMIT_MAX, 30),                // 30 PIN-gated / 15 min / IP

  // Backups
  backupCron: process.env.BACKUP_CRON || '0 2 * * *',                            // 02:00 daily
  backupRetentionDays: parseInt10(process.env.BACKUP_RETENTION_DAYS, 30),

  // Logging
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // Diagnostic / version info
  appVersion: process.env.APP_VERSION || require('../package.json').version,
};

module.exports = config;
