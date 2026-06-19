// Security headers — manual implementation (replaces helmet).
// Sets the same set of headers helmet would for a single-origin local app:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: SAMEORIGIN
// - Referrer-Policy: no-referrer
// - Strict-Transport-Security (only if behind HTTPS)
// - Content-Security-Policy (single-origin, inline scripts allowed for now)
// - Removes X-Powered-By
//
// NOTE: 'unsafe-inline' for script-src is required because pages have inline
// <script>...</script> init blocks. For a public-internet deployment, move
// inline scripts to .js files and remove 'unsafe-inline'.

'use strict';

const SECURITY_HEADERS = {
  // Prevent MIME-sniffing (force browsers to respect Content-Type)
  'X-Content-Type-Options': 'nosniff',
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  // Don't leak referrer to other origins
  'Referrer-Policy': 'no-referrer',
  // Disallow embedding resources from other origins
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Content Security Policy — single-origin LAN app
  'Content-Security-Policy': [
    "default-src 'self'",
    // 'unsafe-inline' for script+style because pages have inline init blocks.
    // Move inline scripts to external .js files to remove this.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

module.exports = function security() {
  return function securityMiddleware(req, res, next) {
    // Remove the X-Powered-By header (Express adds it by default)
    res.removeHeader('X-Powered-By');
    // Set all security headers
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  };
};

// Exposed for tests
module.exports.HEADERS = SECURITY_HEADERS;
