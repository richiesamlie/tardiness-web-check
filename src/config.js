// Centralized config loader.
// Reads once at startup; can be overridden via environment variables.
// No secrets live here — for v1, everything is local & non-secret.

'use strict';

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

const config = {
  // Server
  port: parseInt10(process.env.PORT, 3000),
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
