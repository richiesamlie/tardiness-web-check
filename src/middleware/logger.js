// Request logger.
// Emits a one-line summary per request. Includes method, path, status, duration, requestId, IP.
// Skips the noisy /api/health endpoint (used by load balancers).

'use strict';

const config = require('../config');

const HEALTH_PATHS = new Set(['/api/health', '/']);

function shouldLog(req) {
  if (req.method === 'GET' && HEALTH_PATHS.has(req.path)) return false;
  return true;
}

function fmt(req, res, ms) {
  const ip = (req.ip || req.connection?.remoteAddress || '').replace(/^::ffff:/, '');
  const len = res.getHeader('content-length') || '-';
  return `${req.id}  ${req.method}  ${res.statusCode}  ${ms}ms  ${len}b  ${ip}  ${req.originalUrl}`;
}

module.exports = function logger() {
  return (req, res, next) => {
    if (!shouldLog(req)) return next();
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const line = fmt(req, res, ms.toFixed(1));
      // 5xx -> stderr (error); 4xx -> warn; 2xx/3xx -> info
      if (res.statusCode >= 500) console.error(line);
      else if (res.statusCode >= 400) console.warn(line);
      else if (config.logLevel !== 'silent') console.log(line);
    });
    next();
  };
};
