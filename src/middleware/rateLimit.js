// Rate limit middleware.
// - General: 600 req / 15 min / IP (default; configurable)
// - PIN-gated: 30 req / 15 min / IP (stricter, for /api/* mutating routes)

'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

const message429 = { error: 'too many requests, please slow down', code: 'rate_limited' };

function general() {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: message429,
  });
}

function forPin() {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.pinRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: message429,
    // PIN-gated routes are POST/PUT/DELETE; lower max protects against brute force.
  });
}

module.exports = { general, forPin };
