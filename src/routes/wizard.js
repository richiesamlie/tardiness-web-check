const express = require('express');
const router = express.Router();
const { get, set, has } = require('../lib/config');
const {
  hashPin, verifyPin, generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode, isWeakPin,
} = require('../lib/pin');
const { log } = require('../lib/audit');

// GET /api/wizard/status — first-run wizard state
router.get('/status', (req, res) => {
  const db = req.app.locals.db;
  res.json({
    completed: !!get(db, 'wizard_completed', false),
    has_school: has(db, 'school_name'),
    has_year: has(db, 'academic_year'),
    has_pin: has(db, 'admin_pin_hash'),
  });
});

// POST /api/wizard/step/school
router.post('/step/school', (req, res) => {
  const db = req.app.locals.db;
  const name = String(req.body?.school_name || '').trim();
  if (!name) return res.status(400).json({ errors: ['school_name is required'] });
  set(db, 'school_name', name);
  log(db, { action: 'wizard.set_school', details: { school_name: name } });
  res.json({ ok: true });
});

// POST /api/wizard/step/year
router.post('/step/year', (req, res) => {
  const db = req.app.locals.db;
  const year = String(req.body?.academic_year || '').trim();
  if (!year || !/^\d{4}\/\d{4}$/.test(year)) {
    return res.status(400).json({ errors: ['academic_year must be in format YYYY/YYYY (e.g. 2025/2026)'] });
  }
  set(db, 'academic_year', year);
  log(db, { action: 'wizard.set_year', details: { academic_year: year } });
  res.json({ ok: true });
});

// POST /api/wizard/step/pin — returns recovery code ONCE
router.post('/step/pin', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { pin, pin_confirm } = req.body || {};
    const errors = [];
    if (!pin) errors.push('pin is required');
    else if (!/^\d{4,8}$/.test(String(pin))) errors.push('pin must be 4-8 digits');
    if (pin !== pin_confirm) errors.push('pin and pin_confirm do not match');
    if (isWeakPin(pin)) errors.push('pin is too weak (avoid 1234, 1111, etc.)');
    if (errors.length) return res.status(400).json({ errors });

    const hash = await hashPin(pin);
    const code = generateRecoveryCode();
    const codeHash = await hashRecoveryCode(code);
    set(db, 'admin_pin_hash', hash);
    set(db, 'recovery_code_hash', codeHash);
    log(db, { action: 'wizard.set_pin' });
    res.json({
      ok: true,
      recovery_code: code,
      recovery_message: 'Save this code somewhere safe — it is the ONLY way to reset your PIN if you forget it. This is the only time it will be shown.',
    });
  } catch (e) { next(e); }
});

// POST /api/wizard/reset-pin — use recovery code to set new PIN, returns new recovery code
router.post('/reset-pin', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { recovery_code, pin, pin_confirm } = req.body || {};
    const errors = [];
    if (!recovery_code) errors.push('recovery_code is required');
    if (!pin || !/^\d{4,8}$/.test(String(pin))) errors.push('pin must be 4-8 digits');
    if (pin !== pin_confirm) errors.push('pin and pin_confirm do not match');
    if (isWeakPin(pin)) errors.push('pin is too weak');
    if (errors.length) return res.status(400).json({ errors });

    const codeHash = get(db, 'recovery_code_hash');
    const ok = await verifyRecoveryCode(recovery_code, codeHash);
    if (!ok) return res.status(403).json({ errors: ['invalid recovery code'] });

    const newHash = await hashPin(pin);
    const newCode = generateRecoveryCode();
    const newCodeHash = await hashRecoveryCode(newCode);
    set(db, 'admin_pin_hash', newHash);
    set(db, 'recovery_code_hash', newCodeHash);
    log(db, { action: 'wizard.reset_pin' });
    res.json({ ok: true, recovery_code: newCode });
  } catch (e) { next(e); }
});

// POST /api/wizard/complete — mark wizard as done (requires prior steps)
router.post('/complete', (req, res) => {
  const db = req.app.locals.db;
  if (!has(db, 'school_name') || !has(db, 'academic_year') || !has(db, 'admin_pin_hash')) {
    return res.status(400).json({
      errors: ['wizard incomplete — finish school, year, and pin steps first'],
      status: {
        has_school: has(db, 'school_name'),
        has_year: has(db, 'academic_year'),
        has_pin: has(db, 'admin_pin_hash'),
      },
    });
  }
  set(db, 'wizard_completed', true);
  log(db, { action: 'wizard.completed' });
  res.json({ ok: true });
});

module.exports = router;
