// Daily backup scheduler. Pure setTimeout recursion — no dependency.
// Replaces node-cron which added a dep for one cron expression.

'use strict';

const path = require('node:path');
const backup = require('./backup');
const { log } = require('./audit');

let backupTimeout = null;
let lastRunDate = null;

function msUntilNext2AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);  // 02:00:00.000 local
  if (next <= now) next.setDate(next.getDate() + 1);  // already past — tomorrow
  return next - now;
}

async function runDailyBackup(db, dbPath) {
  const today = new Date().toDateString();
  if (lastRunDate === today) return;  // already ran today (e.g. on hot-reload)
  lastRunDate = today;
  try {
    const folder = backup.getBackupFolder(db);
    const result = await backup.createBackup(db, dbPath, { saveToFolder: folder });
    log(db, {
      action: 'auto_backup.completed',
      details: { filename: result.savedPath ? path.basename(result.savedPath) : null },
    });
  } catch (e) {
    log(db, { action: 'auto_backup.failed', details: { error: e.message } });
  }
}

function scheduleNext(db, dbPath) {
  const ms = msUntilNext2AM();
  backupTimeout = setTimeout(async () => {
    await runDailyBackup(db, dbPath);
    scheduleNext(db, dbPath);  // re-schedule for tomorrow
  }, ms);
  // Don't keep the process alive just for the backup
  if (backupTimeout.unref) backupTimeout.unref();
}

function startBackupScheduler(db, dbPath) {
  if (process.env.NODE_ENV === 'test') return null;
  if (backupTimeout) return backupTimeout;
  scheduleNext(db, dbPath);
  return backupTimeout;
}

function stopBackupScheduler() {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
    backupTimeout = null;
  }
}

// Export for testing
module.exports = {
  startBackupScheduler,
  stopBackupScheduler,
  msUntilNext2AM,        // exposed for tests
  runDailyBackup,        // exposed for tests (force-run)
};
