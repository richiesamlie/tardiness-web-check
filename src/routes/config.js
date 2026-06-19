const express = require('express');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const { get, set, has } = require('../lib/config');

const PUBLIC_KEYS = ['school_name', 'academic_year', 'wizard_completed'];

// GET /api/config — public safe fields
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const body = {};
  for (const k of PUBLIC_KEYS) body[k] = get(db, k, null);
  res.json(body);
});

// GET /api/config/all — private fields (PIN-gated)
router.get('/all', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const body = {};
  for (const k of PUBLIC_KEYS) body[k] = get(db, k, null);
  body.has_pin = has(db, 'admin_pin_hash');
  body.recovery_code_active = has(db, 'recovery_code_hash');
  body.backup_folder = get(db, 'backup_folder', null);
  res.json(body);
});

// PUT /api/config — update safe fields (PIN-gated)
router.put('/', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const { school_name, academic_year, backup_folder } = req.body || {};
  const errors = [];
  if (school_name !== undefined && !String(school_name).trim()) errors.push('school_name cannot be empty');
  if (academic_year !== undefined && !String(academic_year).trim()) errors.push('academic_year cannot be empty');
  if (errors.length) return res.status(400).json({ errors });
  if (school_name !== undefined) set(db, 'school_name', String(school_name).trim());
  if (academic_year !== undefined) set(db, 'academic_year', String(academic_year).trim());
  if (backup_folder !== undefined) set(db, 'backup_folder', String(backup_folder).trim());
  res.json({ ok: true });
});

module.exports = router;
