// Security headers via helmet, tuned for a single-origin local app.
// Disables COEP (single-origin) and enables a strict default set.
// NOTE: 'unsafe-inline' is permitted for <script> because each page has an inline
// init block. For a public-internet deployment, move the inline scripts to .js files
// and remove 'unsafe-inline'.

'use strict';

const helmet = require('helmet');

module.exports = function security() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        // 'unsafe-inline' is required because pages have <script>...</script> init blocks.
        // For hardened deployments, move these to external .js files and remove this.
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  });
};
