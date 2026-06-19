const path = require('node:path');
const cron = require('node-cron');
const backup = require('./backup');
const { log } = require('./audit');

let scheduledTask = null;

function startBackupScheduler(db, dbPath) {
  if (process.env.NODE_ENV === 'test') return null;
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule('0 2 * * *', async () => {
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
  });
  return scheduledTask;
}

function stopBackupScheduler() {
  if (scheduledTask) { scheduledTask.stop(); scheduledTask = null; }
}

module.exports = { startBackupScheduler, stopBackupScheduler };
