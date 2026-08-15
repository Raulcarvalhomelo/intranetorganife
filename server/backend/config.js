'use strict';

const path = require('path');

function loadConfig(env) {
  const source = env || process.env;
  const databaseDir = path.join(__dirname, '../database');
  return {
    port: Number(source.PORT) || 1337,
    databaseDir,
    logsDir: path.join(databaseDir, 'logs'),
    snapshotsDir: path.join(databaseDir, 'snapshots'),
    logRetentionDays: Math.max(1, Number(source.LOG_RETENTION_DAYS) || 3),
    logFlushIntervalMs: Math.max(200, Number(source.LOG_FLUSH_INTERVAL_MS) || 1000)
  };
}

module.exports = { loadConfig };
