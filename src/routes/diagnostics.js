const express = require('express');
const fs = require('node:fs');
const router = express.Router();
const { requirePin } = require('../middleware/requirePin');
const { recent } = require('../lib/audit');
const backupLib = require('../lib/backup');
const { get } = require('../lib/config');
const os = require('node:os');

// ===== Helpers =====

function buildDiagnostics(db, req) {
  const body = {
    generated_at: new Date().toISOString(),
    server: {
      app_version: backupLib.APP_VERSION,
      schema_version: backupLib.SCHEMA_VERSION,
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime_seconds: Math.round(process.uptime()),
      hostname: os.hostname(),
      pid: process.pid,
    },
    url: {
      protocol: req.protocol,
      host: req.get('host'),
      public_url: `${req.protocol}://${req.get('host')}`,
    },
    health: { ok: true },
  };

  if (db) {
    try {
      const studentCount = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
      const activeStudentCount = db.prepare('SELECT COUNT(*) AS n FROM students WHERE active = 1').get().n;
      const eventCount = db.prepare('SELECT COUNT(*) AS n FROM tardiness_events').get().n;
      const eventCountYear = db.prepare('SELECT COUNT(*) AS n FROM tardiness_events WHERE academic_year = ?')
        .get(req.app.locals.getCurrentAcademicYear()).n;
      let dbSize = 0;
      const pragma = db.prepare('PRAGMA database_list').get();
      if (pragma && pragma.file) dbSize = fs.statSync(pragma.file).size;
      body.database = {
        path: pragma?.file || null,
        size_bytes: dbSize,
        student_count: studentCount,
        active_student_count: activeStudentCount,
        event_count: eventCount,
        event_count_this_year: eventCountYear,
        academic_year: req.app.locals.getCurrentAcademicYear(),
        wizard_completed: !!get(db, 'wizard_completed', false),
      };
    } catch (e) {
      body.database = { error: e.message };
    }
  }

  try {
    const folder = backupLib.getBackupFolder(db);
    body.backup = {
      folder,
      last_backup: backupLib.getLastBackupTime(folder),
      backup_count: backupLib.listBackups(folder).length,
      disk_free_bytes: backupLib.getDiskFreeBytes(folder),
    };
  } catch (e) {
    body.backup = { error: e.message };
  }

  try {
    body.recent_actions = recent(db, { limit: 20 });
  } catch {
    body.recent_actions = [];
  }

  return body;
}

function formatDiagnosticsText(d) {
  const lines = [
    'TARDINESS APP DIAGNOSTICS',
    `Generated: ${d.generated_at}`,
    '',
    'SERVER',
    `  App version:    ${d.server.app_version}`,
    `  Schema version: ${d.server.schema_version}`,
    `  Node version:   ${d.server.node_version}`,
    `  Platform:       ${d.server.platform} ${d.server.arch}`,
    `  Uptime:         ${d.server.uptime_seconds} seconds`,
    `  Hostname:       ${d.server.hostname}`,
    `  PID:            ${d.server.pid}`,
    '',
    'URL',
    `  Public URL: ${d.url.public_url}`,
    '',
    'DATABASE',
    d.database?.error
      ? `  Error: ${d.database.error}`
      : [
          `  Path:               ${d.database.path}`,
          `  Size:               ${d.database.size_bytes} bytes`,
          `  Students (total):   ${d.database.student_count}`,
          `  Students (active):  ${d.database.active_student_count}`,
          `  Events (total):     ${d.database.event_count}`,
          `  Events (this year): ${d.database.event_count_this_year}`,
          `  Academic year:      ${d.database.academic_year}`,
          `  Wizard completed:   ${d.database.wizard_completed}`,
        ].join('\n  '),
    '',
    'BACKUP',
    d.backup?.error
      ? `  Error: ${d.backup.error}`
      : [
          `  Folder:       ${d.backup.folder}`,
          `  Last backup:  ${d.backup.last_backup || '(never)'}`,
          `  Backup count: ${d.backup.backup_count}`,
          `  Disk free:    ${d.backup.disk_free_bytes} bytes`,
        ].join('\n  '),
    '',
    'RECENT ACTIONS (last 20)',
    ...d.recent_actions.map(a => `  [${a.at}] ${a.action}${a.actor ? ' by ' + a.actor : ''}${a.ip ? ' from ' + a.ip : ''}`),
  ];
  return lines.join('\n');
}

// ===== Routes =====

// GET /api/audit?limit=50&action=backup — view recent admin actions
router.get('/audit', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const actionPrefix = (req.query.action || '').trim() || null;
  const entries = recent(db, { limit, action: actionPrefix });
  res.json({ entries, count: entries.length });
});

// GET /api/diagnostics — "Get Help" blob (JSON, PIN-gated)
router.get('/diagnostics', requirePin, (req, res) => {
  const db = req.app.locals.db;
  res.json(buildDiagnostics(db, req));
});

// GET /api/diagnostics/text — same data, plain text for "Copy diagnostics"
router.get('/diagnostics/text', requirePin, (req, res) => {
  const db = req.app.locals.db;
  const data = buildDiagnostics(db, req);
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(formatDiagnosticsText(data));
});

module.exports = router;
