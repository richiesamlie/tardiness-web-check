// Rate limit middleware — native implementation (replaces express-rate-limit).
// - General: 600 req / 15 min / IP (configurable)
// - PIN-gated: 30 req / 15 min / IP (stricter, for /api/* mutating routes)
//
// Uses a Map keyed by IP with sliding window counters. Memory: ~24 bytes per IP.
// Periodic cleanup of expired entries every 5 minutes.

'use strict';

const config = require('../config');

const WINDOW_MS = config.rateLimitWindowMs;
const DEFAULT_MAX = config.rateLimitMax;

function createLimiter(max, windowMs = WINDOW_MS) {
  // IP → array of timestamps (sliding window)
  const buckets = new Map();

  // Periodically clean up expired entries (every 5 min)
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of buckets) {
      const fresh = timestamps.filter(t => t > cutoff);
      if (fresh.length === 0) buckets.delete(ip);
      else if (fresh.length !== timestamps.length) buckets.set(ip, fresh);
    }
  }, 5 * 60_000);
  // Don't keep process alive for cleanup
  if (cleanup.unref) cleanup.unref();

  function middleware(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get or create bucket
    let timestamps = buckets.get(ip);
    if (!timestamps) {
      timestamps = [];
      buckets.set(ip, timestamps);
    }

    // Drop expired timestamps from front
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();

    const remaining = Math.max(0, max - timestamps.length - 1);
    const resetSeconds = timestamps.length ? Math.ceil((timestamps[0] + windowMs - now) / 1000) : Math.ceil(windowMs / 1000);

    // Set standard headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));

    if (timestamps.length >= max) {
      res.setHeader('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: 'too many requests, please slow down',
        code: 'rate_limited',
        requestId: req.id,
      });
    }

    timestamps.push(now);
    next();
  }

  middleware._buckets = buckets;  // exposed for tests
  middleware._reset = () => buckets.clear();  // exposed for tests
  return middleware;
}

module.exports = {
  general: () => createLimiter(DEFAULT_MAX),
  forPin: () => createLimiter(config.pinRateLimitMax),
  _createLimiter: createLimiter,  // exposed for tests
};
