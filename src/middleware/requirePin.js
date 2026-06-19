// Express middleware: requires X-Admin-Pin header matching the stored PIN hash.
// For tests: X-Test-Bypass: 1 header skips the check (no env var required).

'use strict';

const { verifyPin } = require('../lib/pin');
const { get } = require('../lib/config');
const { Unauthorized, ServiceUnavailable } = require('../errors');

function requirePin(req, res, next) {
  // Test bypass — explicit header is required, never auto-applied
  if (req.headers['x-test-bypass'] === '1') return next();

  const db = req.app.locals.db;
  if (!db) {
    return next(new ServiceUnavailable('database not available — server may need restart'));
  }

  let hash;
  try { hash = get(db, 'admin_pin_hash'); }
  catch { return next(new ServiceUnavailable('database connection lost — server restart required')); }

  if (!hash) {
    return next(new ServiceUnavailable('PIN not configured. Complete the first-run wizard to set one.'));
  }

  const pin = req.headers['x-admin-pin'];
  if (!pin) {
    res.set('WWW-Authenticate', 'PIN');
    return next(new Unauthorized('PIN required'));
  }

  verifyPin(pin, hash).then(ok => {
    if (!ok) {
      res.set('WWW-Authenticate', 'PIN');
      return next(new Unauthorized('Invalid PIN'));
    }
    next();
  }).catch(next);
}

module.exports = { requirePin };
