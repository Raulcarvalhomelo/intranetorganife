'use strict';

const path = require('path');

function positiveNumber(value, fallback, minimum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum) return fallback;
  return numeric;
}

function loadConfig(env) {
  const source = env || process.env;
  const configuredDatabaseDir = String(source.ORGANIFE_DATABASE_DIR || '').trim();
  const databaseDir = configuredDatabaseDir
    ? path.resolve(configuredDatabaseDir)
    : path.join(__dirname, '../database');
  const logRetentionDays = Math.max(1, Math.floor(positiveNumber(source.LOG_RETENTION_DAYS, 3, 1)));
  const logFlushIntervalMs = Math.floor(positiveNumber(source.LOG_FLUSH_INTERVAL_MS, 1000, 200));
  return {
    port: Math.floor(positiveNumber(source.PORT, 1337, 1)),
    databaseDir,
    logsDir: path.join(databaseDir, 'logs'),
    snapshotsDir: path.join(databaseDir, 'snapshots'),
    runtimeStatePath: path.join(databaseDir, 'runtime-state.json'),
    kanbanDatabasePath: path.join(databaseDir, 'kanban.db'),
    logRetentionDays,
    logFlushIntervalMs,
    dashboardUser: String(source.DASHBOARD_USER || '').trim() || 'admin',
    dashboardPasswordDefault: String(source.DASHBOARD_PASSWORD || '').trim() || 'admin123',
    dashboardViewerUser: String(source.DASHBOARD_VIEW_USER || '').trim() || 'visualizacao',
    dashboardViewerPasswordDefault: String(source.DASHBOARD_VIEW_PASSWORD || '').trim() || 'visual1234',
    extensionAdminPasswordDefault: String(source.EXTENSION_ADMIN_PASSWORD || '').trim() || 'admin',
    dashboardSessionSecret: String(source.DASHBOARD_SESSION_SECRET || '').trim(),
    dashboardCookieSecure: String(source.DASHBOARD_COOKIE_SECURE || '') === '1'
  };
}

module.exports = { loadConfig };
