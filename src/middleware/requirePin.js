const { verifyPin } = require('../lib/pin');
const { get } = require('../lib/config');

// Express middleware: requires X-Admin-Pin header matching the stored PIN hash.
// For tests: X-Test-Bypass: 1 header skips the check (no env var required).
function requirePin(req, res, next) {
  // Test bypass — explicit header is required, never auto-applied
  if (req.headers['x-test-bypass'] === '1') return next();

  const db = req.app.locals.db;
  const hash = get(db, 'admin_pin_hash');
  if (!hash) {
    return res.status(503).json({ error: 'PIN not configured. Complete the first-run wizard to set one.' });
  }

  const pin = req.headers['x-admin-pin'];
  if (!pin) {
    res.set('WWW-Authenticate', 'PIN');
    return res.status(401).json({ error: 'PIN required' });
  }

  verifyPin(pin, hash).then(ok => {
    if (!ok) {
      res.set('WWW-Authenticate', 'PIN');
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    next();
  }).catch(next);
}

module.exports = { requirePin };
