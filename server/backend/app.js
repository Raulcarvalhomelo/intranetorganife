const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const { read, write } = require('./state');

const app = express();
const port = Number(process.env.PORT) || 1337;
const sseClients = new Set();
const dashboardSseClients = new Set();
const dashboardUser = String(process.env.DASHBOARD_USER || '').trim() || 'admin';
const dashboardPasswordDefault = String(process.env.DASHBOARD_PASSWORD || '').trim() || 'admin123';
const dashboardViewerUser = String(process.env.DASHBOARD_VIEW_USER || '').trim() || 'visualizacao';
const dashboardViewerPasswordDefault = String(process.env.DASHBOARD_VIEW_PASSWORD || '').trim() || 'visual1234';
const bootState = read();
const bootDashboardPasswordRaw = String((bootState.auth && bootState.auth.dashboardPassword) || '').trim();
let dashboardSetupRequired = !bootDashboardPasswordRaw;
let dashboardPassword = String(bootDashboardPasswordRaw || dashboardPasswordDefault);
let dashboardViewerPassword = String(bootState.auth && bootState.auth.dashboardViewerPassword ? bootState.auth.dashboardViewerPassword : dashboardViewerPasswordDefault);
const sessionSecret = String(process.env.DASHBOARD_SESSION_SECRET || crypto.randomBytes(32).toString('hex'));
const sessionCookieName = 'dashboard_session';
const sessionTtlMs = 1000 * 60 * 60 * 12;
const sessionCookieSecure = process.env.DASHBOARD_COOKIE_SECURE === '1';
const databaseDir = path.join(__dirname, '../database');
const logsDir = path.join(databaseDir, 'logs');
const kanbanDatabasePath = path.join(databaseDir, 'kanban.db');
const LOG_RETENTION_DAYS = Math.max(1, Number(process.env.LOG_RETENTION_DAYS) || 3);
const LOG_FLUSH_INTERVAL_MS = Math.max(200, Number(process.env.LOG_FLUSH_INTERVAL_MS) || 1000);
let logWriteQueue = [];
let logFlushTimer = null;
let logFlushInProgress = false;
let sqlJs = null;
let kanbanDb = null;
let kanbanDbOpenPromise = null;
let kanbanDbFlushTimer = null;
let kanbanDbFlushInProgress = false;
let kanbanDbFlushQueued = false;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function emitUpdate(kind = 'all', extra = null) {
  const basePayload = { updated: true, kind, at: new Date().toISOString() };
  const mergedPayload = extra && typeof extra === 'object'
    ? { ...basePayload, ...extra }
    : basePayload;
  const payload = `data: ${JSON.stringify(mergedPayload)}\n\n`;
  sseClients.forEach((res) => res.write(payload));
  dashboardSseClients.forEach((res) => res.write(payload));
}

function parseJsonSafe(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function buildKanbanSseCard(card) {
  const departments = Array.isArray(card && card.departments)
    ? card.departments.map((entry) => normalizeKanbanText(entry && entry.label ? entry.label : '', 80)).filter(Boolean)
    : [];
  const assignedTo = normalizeKanbanText(
    card && (card.assignedTo !== undefined ? card.assignedTo : card.assigned_to),
    80
  );
  return {
    id: normalizeKanbanText(card && card.id ? card.id : '', 120),
    title: normalizeKanbanText(card && card.title ? card.title : '', 200),
    description: normalizeKanbanText(card && card.description ? card.description : '', 2000),
    status: normalizeKanbanText(card && card.status ? card.status : '', 20).toLowerCase() || 'todo',
    priority: normalizeKanbanText(card && card.priority ? card.priority : '', 20).toLowerCase() || 'med',
    due_at: Number(card && card.dueAt) || 0,
    tags: Array.isArray(parseJsonSafe(card && card.tagsJson, [])) ? parseJsonSafe(card && card.tagsJson, []) : [],
    attachments: Array.isArray(parseJsonSafe(card && card.attachmentsJson, [])) ? parseJsonSafe(card && card.attachmentsJson, []) : [],
    depends_on: Array.isArray(parseJsonSafe(card && card.dependsOnJson, [])) ? parseJsonSafe(card && card.dependsOnJson, []) : [],
    sprint_id: normalizeKanbanText(card && card.sprintId ? card.sprintId : '', 80),
    assigned_to: assignedTo || null,
    assigned_to_display: assignedTo || null,
    recurrence: parseJsonSafe(card && card.recurrenceJson, { type: 'none', lastTrigger: 0 }),
    created_at: Number(card && card.createdAt) || Date.now(),
    updated_at: Number(card && card.updatedAt) || Date.now(),
    deleted: Number(card && card.deleted) ? 1 : 0,
    departments,
    department: departments[0] || '',
    assignedTo: assignedTo || null,
    assignedToDisplay: assignedTo || null
  };
}

function uniq(arr) {
  return [...new Set((arr || []).map((v) => String(v).trim()).filter(Boolean))];
}

function sanitizeQuickLinks(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      name: String(item && item.name ? item.name : '').trim(),
      url: String(item && item.url ? item.url : '').trim()
    }))
    .filter((item) => item.name && item.url);
}

function parseDomain(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (raw.includes('://')) return new URL(raw).hostname.toLowerCase();
  } catch {}
  return raw.split('/')[0].split(':')[0].toLowerCase();
}

function buildDomainAliases(input) {
  const raw = String(input || '').trim().toLowerCase();
  const parsed = parseDomain(raw);
  const base = String(parsed || raw).replace(/^www\./, '').replace(/^\*\./, '').trim();
  return uniq([
    raw,
    parsed,
    base,
    base ? `*.${base}` : '',
    raw.replace(/^www\./, ''),
    raw.replace(/^\*\./, ''),
    raw.replace(/^www\./, '').replace(/^\*\./, '')
  ].filter(Boolean));
}

function removeDomainFromList(list, domain) {
  const aliases = buildDomainAliases(domain);
  if (!aliases.length) return Array.isArray(list) ? list : [];
  return (Array.isArray(list) ? list : []).filter((entry) => {
    const entryAliases = buildDomainAliases(entry);
    return !entryAliases.some((candidate) => aliases.includes(candidate));
  });
}

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getLogUser(log) {
  return String(log.browserUser || log.windowsUser || log.user || log.user_id || (log.data && (log.data.browserUser || log.data.user)) || '').trim();
}

function getLogBrowser(log) {
  return String(log.browser || log.browserName || (log.data && (log.data.browser || log.data.browserName)) || '').trim();
}

function getLogType(log) {
  return String(log.type || log.action || '').trim();
}

function getLogDomain(log) {
  const details = log && typeof log.details === 'object' ? log.details : {};
  const data = log && typeof log.data === 'object' ? log.data : {};
  const candidates = [
    log.domain,
    log.hostname,
    log.host,
    log.url,
    log.originalUrl,
    log.referrer,
    details.domain,
    details.hostname,
    details.host,
    details.url,
    details.href,
    details.site,
    data.domain,
    data.hostname,
    data.host,
    data.url,
    data.href,
    data.site
  ];
  for (const candidate of candidates) {
    const parsed = parseDomain(candidate);
    if (parsed) return parsed;
  }
  return '';
}

function toDayKey(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getLogFilePath(dayKey) {
  return path.join(logsDir, `${dayKey}.ndjson`);
}

function getRetentionDayKeys() {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < LOG_RETENTION_DAYS; i += 1) {
    const day = new Date(now);
    day.setUTCDate(now.getUTCDate() - i);
    keys.push(toDayKey(day));
  }
  return keys;
}

function ensureLogItem(item, fallbackIndex = 0) {
  const source = item && typeof item === 'object' ? item : {};
  const timestamp = Number.isNaN(new Date(source.timestamp).getTime())
    ? new Date().toISOString()
    : new Date(source.timestamp).toISOString();
  const numericId = Number(source.id);
  return {
    ...source,
    id: Number.isFinite(numericId) ? numericId : Date.now() + fallbackIndex,
    timestamp
  };
}

function queueLog(item) {
  const normalized = ensureLogItem(item);
  const dayKey = toDayKey(normalized.timestamp);
  logWriteQueue.push({
    dayKey,
    line: `${JSON.stringify(normalized)}\n`
  });
  scheduleLogFlush();
  return normalized;
}

function scheduleLogFlush(delayMs = LOG_FLUSH_INTERVAL_MS) {
  if (logFlushTimer) return;
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    void flushLogQueue();
  }, Math.max(0, delayMs));
}

async function cleanupOldLogFiles() {
  await fs.promises.mkdir(logsDir, { recursive: true });
  const keep = new Set(getRetentionDayKeys());
  const entries = await fs.promises.readdir(logsDir, { withFileTypes: true });
  const filesToRemove = entries
    .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.ndjson$/i.test(entry.name))
    .filter((entry) => !keep.has(entry.name.replace(/\.ndjson$/i, '')))
    .map((entry) => path.join(logsDir, entry.name));
  await Promise.all(filesToRemove.map((filePath) => fs.promises.unlink(filePath).catch(() => {})));
}

async function flushLogQueue() {
  if (logFlushInProgress) return;
  if (!logWriteQueue.length) return;
  logFlushInProgress = true;
  const batch = logWriteQueue.splice(0, logWriteQueue.length);
  try {
    await fs.promises.mkdir(logsDir, { recursive: true });
    const grouped = new Map();
    batch.forEach((entry) => {
      const current = grouped.get(entry.dayKey) || '';
      grouped.set(entry.dayKey, `${current}${entry.line}`);
    });
    for (const [dayKey, content] of grouped.entries()) {
      await fs.promises.appendFile(getLogFilePath(dayKey), content, 'utf8');
    }
    await cleanupOldLogFiles();
  } catch {
    logWriteQueue = batch.concat(logWriteQueue);
    scheduleLogFlush(LOG_FLUSH_INTERVAL_MS);
  } finally {
    logFlushInProgress = false;
    if (logWriteQueue.length) scheduleLogFlush(0);
  }
}

function parseNdjsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function matchesLogFilters(log, filters) {
  const { q, type, domain, user, users, allUsers } = filters;
  const logType = getLogType(log).toLowerCase();
  const logDomain = getLogDomain(log);
  const logUser = getLogUser(log).toLowerCase();
  const logBrowser = getLogBrowser(log).toLowerCase();
  if (type && logType !== type) return false;
  if (domain && logDomain !== domain) return false;
  if (!allUsers) {
    if (Array.isArray(users) && users.length && !users.some((entry) => logUser.includes(entry))) return false;
    if (user && !logUser.includes(user)) return false;
  }
  if (!q) return true;
  const payload = JSON.stringify(log.details || log.data || log || {}).toLowerCase();
  return logUser.includes(q) || logBrowser.includes(q) || logType.includes(q) || logDomain.includes(q) || payload.includes(q);
}

function normalizeDayKey(dayInput) {
  const raw = String(dayInput || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10) === raw ? raw : '';
}

function normalizeDepartmentSlug(input) {
  return String(input || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeKanbanText(input, maxLength = 500) {
  return String(input || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeKanbanDepartments(input, legacyDepartment = '') {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();
  const departments = [];
  [...source, legacyDepartment].forEach((value) => {
    const label = normalizeKanbanText(value, 80);
    const slug = normalizeDepartmentSlug(label);
    if (!label || !slug || seen.has(slug)) return;
    seen.add(slug);
    departments.push({ label, slug });
  });
  return departments;
}

function normalizeKanbanTimestamp(input, fallback = Date.now()) {
  const numeric = Number(input);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeKanbanDependsOn(input, currentId = '') {
  const current = normalizeKanbanText(currentId, 120);
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();
  const list = [];
  source.forEach((value) => {
    const normalized = normalizeKanbanText(value, 120);
    if (!normalized || normalized === current || seen.has(normalized)) return;
    seen.add(normalized);
    list.push(normalized);
  });
  return list.slice(0, 20);
}

function normalizeKanbanCardInput(input, fallbackUpdatedAt = Date.now()) {
  const source = input && typeof input === 'object' ? input : {};
  const id = normalizeKanbanText(source.id, 120);
  if (!id) return null;
  const updatedAt = normalizeKanbanTimestamp(
    source.updated_at !== undefined && source.updated_at !== null ? source.updated_at : source.updatedAt,
    fallbackUpdatedAt
  );
  const createdAt = normalizeKanbanTimestamp(
    source.created_at !== undefined && source.created_at !== null ? source.created_at : source.createdAt,
    updatedAt
  );
  const deletedRaw = Number(source.deleted);
  const deleted = deletedRaw === 1 || deletedRaw === true || String(source.deleted).toLowerCase() === 'true' ? 1 : 0;
  const statusRaw = normalizeKanbanText(source.status, 20).toLowerCase();
  const status = ['backlog', 'todo', 'doing', 'done'].includes(statusRaw) ? statusRaw : 'todo';
  const priorityRaw = normalizeKanbanText(source.priority, 20).toLowerCase();
  const priority = ['low', 'med', 'high', 'urgent'].includes(priorityRaw) ? priorityRaw : 'med';
  const dueAt = normalizeKanbanTimestamp(
    source.due_at !== undefined && source.due_at !== null ? source.due_at : source.dueAt,
    0
  );
  const dependsOn = normalizeKanbanDependsOn(
    source.depends_on !== undefined && source.depends_on !== null ? source.depends_on : source.dependsOn,
    id
  );
  const departments = normalizeKanbanDepartments(source.departments, source.department);
  const assignedTo = normalizeKanbanText(
    source.assigned_to !== undefined && source.assigned_to !== null
      ? source.assigned_to
      : (
        source.assignedTo !== undefined && source.assignedTo !== null
          ? source.assignedTo
          : (source.assigned_to_display ?? source.assignedToDisplay)
      ),
    80
  );
  return {
    id,
    title: normalizeKanbanText(source.title || source.text, 200),
    description: normalizeKanbanText(source.description, 2000),
    status,
    priority,
    dueAt,
    tagsJson: JSON.stringify(Array.isArray(source.tags) ? source.tags : []),
    attachmentsJson: JSON.stringify(Array.isArray(source.attachments) ? source.attachments : []),
    dependsOnJson: JSON.stringify(dependsOn),
    sprintId: normalizeKanbanText(
      source.sprint_id !== undefined && source.sprint_id !== null ? source.sprint_id : source.sprintId,
      80
    ),
    assignedTo: assignedTo || null,
    recurrenceJson: JSON.stringify(source.recurrence && typeof source.recurrence === 'object' ? source.recurrence : { type: 'none', lastTrigger: 0 }),
    createdAt,
    updatedAt,
    deleted,
    departments
  };
}

function locateSqlJsFile(file) {
  const localNodeModulesPath = path.join(__dirname, '../node_modules/sql.js/dist', file);
  if (fs.existsSync(localNodeModulesPath)) return localNodeModulesPath;
  const cwdNodeModulesPath = path.join(process.cwd(), 'node_modules/sql.js/dist', file);
  if (fs.existsSync(cwdNodeModulesPath)) return cwdNodeModulesPath;
  return path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', file);
}

async function openKanbanDatabase() {
  if (kanbanDb) return kanbanDb;
  if (kanbanDbOpenPromise) return kanbanDbOpenPromise;
  kanbanDbOpenPromise = (async () => {
    if (!sqlJs) {
      sqlJs = await initSqlJs({ locateFile: locateSqlJsFile });
    }
    let fileBytes = null;
    try {
      fileBytes = await fs.promises.readFile(kanbanDatabasePath);
    } catch {}
    if (fileBytes && fileBytes.length) {
      kanbanDb = new sqlJs.Database(new Uint8Array(fileBytes));
      return kanbanDb;
    }
    kanbanDb = new sqlJs.Database();
    return kanbanDb;
  })();
  try {
    return await kanbanDbOpenPromise;
  } finally {
    kanbanDbOpenPromise = null;
  }
}

function scheduleKanbanDbFlush() {
  if (kanbanDbFlushTimer) clearTimeout(kanbanDbFlushTimer);
  kanbanDbFlushTimer = setTimeout(() => {
    kanbanDbFlushTimer = null;
    void flushKanbanDbToDisk();
  }, 250);
}

async function flushKanbanDbToDisk() {
  if (!kanbanDb) return;
  if (kanbanDbFlushInProgress) {
    kanbanDbFlushQueued = true;
    return;
  }
  kanbanDbFlushInProgress = true;
  try {
    const exported = kanbanDb.export();
    const tempPath = `${kanbanDatabasePath}.tmp`;
    await fs.promises.writeFile(tempPath, Buffer.from(exported));
    await fs.promises.rename(tempPath, kanbanDatabasePath);
  } finally {
    kanbanDbFlushInProgress = false;
    if (kanbanDbFlushQueued) {
      kanbanDbFlushQueued = false;
      await flushKanbanDbToDisk();
    }
  }
}

async function runSql(sql, params = []) {
  const db = await openKanbanDatabase();
  const values = Array.isArray(params) ? params : [params];
  db.run(sql, values);
  if (/^\s*(insert|update|delete|replace|create|drop|alter|commit)\b/i.test(String(sql || ''))) {
    scheduleKanbanDbFlush();
  }
  return { changes: Number(db.getRowsModified()) || 0 };
}

async function getSql(sql, params = []) {
  const db = await openKanbanDatabase();
  const values = Array.isArray(params) ? params : [params];
  const statement = db.prepare(sql);
  try {
    if (values.length) statement.bind(values);
    if (!statement.step()) return null;
    return statement.getAsObject() || null;
  } finally {
    statement.free();
  }
}

async function allSql(sql, params = []) {
  const db = await openKanbanDatabase();
  const values = Array.isArray(params) ? params : [params];
  const statement = db.prepare(sql);
  try {
    if (values.length) statement.bind(values);
    const rows = [];
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
    return rows;
  } finally {
    statement.free();
  }
}

async function readLogsByDayKeys(dayKeys, filters = {}) {
  const limit = Math.max(1, Math.min(5000, Number(filters.limit) || 200));
  const usersList = String(filters.users || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const allUsers = String(filters.allUsers || '').trim().toLowerCase();
  const normalizedFilters = {
    q: String(filters.q || '').trim().toLowerCase(),
    type: String(filters.type || '').trim().toLowerCase(),
    domain: parseDomain(filters.domain || ''),
    user: String(filters.user || '').trim().toLowerCase(),
    users: usersList,
    allUsers: allUsers === '1' || allUsers === 'true' || allUsers === 'yes'
  };
  const rows = [];
  for (const dayKey of dayKeys) {
    const filePath = getLogFilePath(dayKey);
    let raw = '';
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = raw.split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index] && lines[index].trim();
      if (!line) continue;
      const parsed = parseNdjsonLine(line);
      if (!parsed) continue;
      if (!matchesLogFilters(parsed, normalizedFilters)) continue;
      rows.push(parsed);
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

async function readLogsFromNdjson(filters = {}) {
  return readLogsByDayKeys(getRetentionDayKeys(), filters);
}

async function replaceNdjsonLogs(inputLogs) {
  await flushLogQueue();
  await fs.promises.mkdir(logsDir, { recursive: true });
  const existing = await fs.promises.readdir(logsDir, { withFileTypes: true });
  await Promise.all(existing
    .filter((entry) => entry.isFile() && /\.ndjson$/i.test(entry.name))
    .map((entry) => fs.promises.unlink(path.join(logsDir, entry.name)).catch(() => {})));
  if (!Array.isArray(inputLogs) || !inputLogs.length) {
    await cleanupOldLogFiles();
    return;
  }
  const grouped = new Map();
  inputLogs.forEach((log, index) => {
    const normalized = ensureLogItem(log, index);
    const dayKey = toDayKey(normalized.timestamp);
    const list = grouped.get(dayKey) || [];
    list.push(normalized);
    grouped.set(dayKey, list);
  });
  for (const [dayKey, logs] of grouped.entries()) {
    const sortedLogs = logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const content = `${sortedLogs.map((row) => JSON.stringify(row)).join('\n')}\n`;
    await fs.promises.writeFile(getLogFilePath(dayKey), content, 'utf8');
  }
  await cleanupOldLogFiles();
}

async function migrateLegacyLogsFromRuntimeState() {
  const state = read();
  const legacyLogs = Array.isArray(state.logs) ? state.logs : [];
  if (!legacyLogs.length) return;
  await replaceNdjsonLogs(legacyLogs);
  state.logs = [];
  write(state);
}

async function initializeKanbanStore() {
  await fs.promises.mkdir(databaseDir, { recursive: true });
  await runSql(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT,
      due_at INTEGER,
      tags_json TEXT,
      attachments_json TEXT,
      sprint_id TEXT,
      assigned_to TEXT,
      recurrence_json TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `);
  await runSql(`
    CREATE TABLE IF NOT EXISTS card_departments (
      card_id TEXT NOT NULL,
      department_slug TEXT NOT NULL,
      department_label TEXT,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0,
      PRIMARY KEY (card_id, department_slug)
    )
  `);
  await runSql(`
    CREATE TABLE IF NOT EXISTS kanban_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await runSql('CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at)');
  await runSql('CREATE INDEX IF NOT EXISTS idx_card_departments_slug ON card_departments(department_slug, deleted, updated_at)');
  await runSql('ALTER TABLE cards ADD COLUMN depends_on_json TEXT').catch(() => {});
  await runSql('ALTER TABLE cards ADD COLUMN assigned_to TEXT').catch(() => {});
  await migrateNdjsonSnapshotsToSqlite();
  await flushKanbanDbToDisk();
}

async function upsertKanbanCard(card) {
  if (!card || !card.id) return;
  await runSql('BEGIN IMMEDIATE TRANSACTION');
  try {
    await runSql(
      `INSERT INTO cards (
        id, title, description, status, priority, due_at, tags_json, attachments_json,
        depends_on_json, sprint_id, assigned_to, recurrence_json, created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        priority = excluded.priority,
        due_at = excluded.due_at,
        tags_json = excluded.tags_json,
        attachments_json = excluded.attachments_json,
        depends_on_json = excluded.depends_on_json,
        sprint_id = excluded.sprint_id,
        assigned_to = excluded.assigned_to,
        recurrence_json = excluded.recurrence_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
      WHERE excluded.updated_at > cards.updated_at`,
      [
        card.id,
        card.title,
        card.description,
        card.status,
        card.priority,
        card.dueAt,
        card.tagsJson,
        card.attachmentsJson,
        card.dependsOnJson,
        card.sprintId,
        card.assignedTo,
        card.recurrenceJson,
        card.createdAt,
        card.updatedAt,
        card.deleted
      ]
    );
    if (card.deleted === 1) {
      await runSql(
        'UPDATE card_departments SET deleted = 1, updated_at = ? WHERE card_id = ? AND updated_at < ?',
        [card.updatedAt, card.id, card.updatedAt]
      );
      await runSql('COMMIT');
      await flushKanbanDbToDisk();
      return;
    }
    const departments = Array.isArray(card.departments) ? card.departments : [];
    for (const department of departments) {
      await runSql(
        `INSERT INTO card_departments (card_id, department_slug, department_label, updated_at, deleted)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(card_id, department_slug) DO UPDATE SET
           department_label = excluded.department_label,
           updated_at = excluded.updated_at,
           deleted = 0
         WHERE excluded.updated_at > card_departments.updated_at`,
        [card.id, department.slug, department.label, card.updatedAt]
      );
    }
    if (departments.length) {
      const placeholders = departments.map(() => '?').join(', ');
      await runSql(
        `UPDATE card_departments
         SET deleted = 1, updated_at = ?
         WHERE card_id = ?
           AND deleted = 0
           AND updated_at < ?
           AND department_slug NOT IN (${placeholders})`,
        [card.updatedAt, card.id, card.updatedAt, ...departments.map((department) => department.slug)]
      );
    } else {
      await runSql(
        `UPDATE card_departments
         SET deleted = 1, updated_at = ?
         WHERE card_id = ?
           AND deleted = 0
           AND updated_at < ?`,
        [card.updatedAt, card.id, card.updatedAt]
      );
    }
    await runSql('COMMIT');
    await flushKanbanDbToDisk();
  } catch (error) {
    await runSql('ROLLBACK').catch(() => {});
    throw error;
  }
}

function parseJsonArray(input) {
  try {
    const parsed = JSON.parse(String(input || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(input, fallback) {
  try {
    const parsed = JSON.parse(String(input || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapCardRow(row, departments) {
  const title = String(row.title || '').trim();
  const departmentsList = Array.isArray(departments) ? departments : [];
  return {
    id: row.id,
    title,
    text: title,
    description: String(row.description || ''),
    status: String(row.status || 'todo'),
    priority: String(row.priority || 'med'),
    due_at: Number(row.due_at) || 0,
    dueAt: Number(row.due_at) || 0,
    tags: parseJsonArray(row.tags_json),
    attachments: parseJsonArray(row.attachments_json),
    depends_on: parseJsonArray(row.depends_on_json),
    dependsOn: parseJsonArray(row.depends_on_json),
    sprint_id: String(row.sprint_id || ''),
    sprintId: String(row.sprint_id || ''),
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_to_display: row.assigned_to ? String(row.assigned_to) : null,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    assignedToDisplay: row.assigned_to ? String(row.assigned_to) : null,
    recurrence: parseJsonObject(row.recurrence_json, { type: 'none', lastTrigger: 0 }),
    created_at: Number(row.created_at) || 0,
    createdAt: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    deleted: Number(row.deleted) ? 1 : 0,
    departments: departmentsList.map((entry) => entry.label),
    department: departmentsList[0] ? departmentsList[0].label : ''
  };
}

async function listKanbanCardsByDepartment(departmentLabel) {
  const departmentSlug = normalizeDepartmentSlug(departmentLabel);
  if (!departmentSlug) return [];
  const rows = await allSql(
    `SELECT cards.*
     FROM cards
     INNER JOIN card_departments ON card_departments.card_id = cards.id
     WHERE card_departments.department_slug = ?
       AND card_departments.deleted = 0
       AND cards.deleted = 0`,
    [departmentSlug]
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  const relationRows = await allSql(
    `SELECT card_id, department_slug, department_label
     FROM card_departments
     WHERE card_id IN (${placeholders}) AND deleted = 0`,
    ids
  );
  const departmentsByCard = new Map();
  relationRows.forEach((entry) => {
    const list = departmentsByCard.get(entry.card_id) || [];
    list.push({
      slug: entry.department_slug,
      label: entry.department_label || entry.department_slug
    });
    departmentsByCard.set(entry.card_id, list);
  });
  return rows.map((row) => mapCardRow(row, departmentsByCard.get(row.id) || []));
}

async function migrateNdjsonSnapshotsToSqlite() {
  const marker = await getSql('SELECT value FROM kanban_meta WHERE key = ?', ['ndjson_migrated']);
  if (marker && marker.value === '1') return;
  const entries = await fs.promises.readdir(databaseDir, { withFileTypes: true }).catch(() => []);
  const snapshotFiles = entries
    .filter((entry) => entry.isFile() && /^kanban-snapshots-.*\.ndjson$/i.test(entry.name))
    .map((entry) => path.join(databaseDir, entry.name));
  for (const filePath of snapshotFiles) {
    const raw = await fs.promises.readFile(filePath, 'utf8').catch(() => '');
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const parsed = parseNdjsonLine(line);
      if (!parsed) continue;
      const savedAt = Date.parse(parsed.savedAt || parsed.saved_at || '');
      const fallbackUpdatedAt = Number.isFinite(savedAt) ? savedAt : Date.now();
      const rawKanban = parsed.kanban && typeof parsed.kanban === 'object' ? parsed.kanban : parsed;
      const todos = Array.isArray(rawKanban.todos) ? rawKanban.todos : [];
      for (const todo of todos) {
        const card = normalizeKanbanCardInput(todo, fallbackUpdatedAt);
        if (!card) continue;
        await upsertKanbanCard(card);
      }
    }
  }
  await runSql(
    `INSERT INTO kanban_meta (key, value)
     VALUES ('ndjson_migrated', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

function normalizeReleaseRequestInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const clientRequestId = String(source.clientRequestId || source.client_request_id || '').trim();
  const domain = String(source.domain || '').toLowerCase().trim();
  const reason = String(source.reason || source.motivo || '').trim();
  const user = String(source.user || source.browserUser || 'Desconhecido').trim() || 'Desconhecido';
  const browser = String(source.browser || source.browserName || 'Desconhecido').trim() || 'Desconhecido';
  const originalUrl = String(source.originalUrl || '').trim();
  const timestamp = String(source.timestamp || '').trim() || new Date().toISOString();
  return { clientRequestId, domain, reason, user, browser, originalUrl, timestamp };
}

function normalizeReleaseRequestStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isPendingReleaseRequestStatus(status) {
  const normalized = normalizeReleaseRequestStatus(status);
  return !normalized || normalized === 'pendente' || normalized === 'pending';
}

function normalizeReleaseRequestUser(value) {
  return String(value || '').trim().toLowerCase();
}

function getReleaseRequestDedupKey(input) {
  const normalized = normalizeReleaseRequestInput(input);
  if (normalized.clientRequestId) return `id:${normalized.clientRequestId}`;
  return `raw:${normalized.timestamp}|${normalized.domain}|${normalized.reason}|${normalized.user}|${normalized.originalUrl}`;
}

function upsertReleaseRequest(state, input) {
  const normalized = normalizeReleaseRequestInput(input);
  if (!normalized.domain) {
    return { error: 'domain-obrigatorio' };
  }
  const dedupKey = getReleaseRequestDedupKey(normalized);
  const existing = (Array.isArray(state.releaseRequests) ? state.releaseRequests : []).find((row) => {
    return getReleaseRequestDedupKey(row) === dedupKey;
  });
  if (existing) {
    return { item: existing, created: false };
  }
  const existingPendingForDomainUser = (Array.isArray(state.releaseRequests) ? state.releaseRequests : []).find((row) => {
    if (!isPendingReleaseRequestStatus(row && row.status)) return false;
    const rowDomain = String((row && row.domain) || '').toLowerCase().trim();
    const rowUser = normalizeReleaseRequestUser((row && (row.user || row.browserUser)) || '');
    return rowDomain === normalized.domain && rowUser === normalizeReleaseRequestUser(normalized.user);
  });
  if (existingPendingForDomainUser) {
    return { item: existingPendingForDomainUser, created: false };
  }
  const item = {
    id: Date.now(),
    ...normalized,
    status: 'pendente'
  };
  state.releaseRequests.unshift(item);
  state.settings.tempAllowedLinks = uniq([...(state.settings.tempAllowedLinks || []), normalized.domain]);
  return { item, created: true };
}

function domainMatches(domain, pattern) {
  const host = parseDomain(domain);
  const p = String(pattern || '').trim().toLowerCase();
  if (!host || !p) return false;
  if (p === '*') return true;
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  if (!p.includes('*')) return host === p;
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(host);
}

function isBlocked(host, blockedSites) {
  return (blockedSites || []).some((rule) => domainMatches(host, rule));
}

function isAllowed(host, allowedDomains) {
  return (allowedDomains || []).some((rule) => domainMatches(host, rule));
}

function safeEqual(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  const b1 = Buffer.from(s1);
  const b2 = Buffer.from(s2);
  if (b1.length !== b2.length) return false;
  return crypto.timingSafeEqual(b1, b2);
}

function signValue(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || '');
  const out = {};
  cookieHeader.split(';').forEach((pair) => {
    const part = pair.trim();
    if (!part) return;
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    out[key] = value;
  });
  return out;
}

function resolveDashboardLogin(username, password) {
  if (safeEqual(username, dashboardUser) && safeEqual(password, dashboardPassword)) {
    return { username: dashboardUser, role: 'admin' };
  }
  if (safeEqual(username, dashboardViewerUser) && safeEqual(password, dashboardViewerPassword)) {
    return { username: dashboardViewerUser, role: 'viewer' };
  }
  return null;
}

function requiresDashboardSetup() {
  return dashboardSetupRequired;
}

function completeDashboardSetup(newPassword) {
  const password = String(newPassword || '').trim();
  if (password.length < 4) return { error: 'senha-dashboard-curta' };
  const state = read();
  state.auth = { ...(state.auth || {}), dashboardPassword: password };
  write(state);
  dashboardPassword = password;
  dashboardSetupRequired = false;
  emitUpdate('settings');
  return { ok: true };
}

function decodeSessionToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const expiresAt = Number(parts.pop());
    const identity = parts.join('.');
    const sep = identity.lastIndexOf('|');
    const username = sep >= 0 ? identity.slice(0, sep) : identity;
    const role = sep >= 0 ? identity.slice(sep + 1) : 'admin';
    if (!username || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const payload = `${identity}.${expiresAt}`;
    if (!safeEqual(sig, signValue(payload))) return null;
    return { username, role: role || 'admin', expiresAt };
  } catch {
    return null;
  }
}

function setSessionCookie(res, username, role = 'admin') {
  const expiresAt = Date.now() + sessionTtlMs;
  const identity = `${username}|${role}`;
  const payload = `${identity}.${expiresAt}`;
  const signed = `${payload}.${signValue(payload)}`;
  const token = Buffer.from(signed).toString('base64');
  let cookie = `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}`;
  if (sessionCookieSecure) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function clearSessionCookie(res) {
  let cookie = `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  if (sessionCookieSecure) cookie += '; Secure';
  res.setHeader('Set-Cookie', cookie);
}

function requireDashboardAuth(req, res, next) {
  const cookies = parseCookies(req);
  const session = decodeSessionToken(cookies[sessionCookieName]);
  if (session) {
    req.dashboardUser = session.username;
    req.dashboardRole = session.role || 'admin';
    return next();
  }
  const pathText = String(req.path || '');
  if (pathText.includes('/dashboard/api/') || pathText.endsWith('/dashboard/updates') || pathText === '/updates') {
    return res.status(401).json({ message: 'nao-autorizado' });
  }
  return res.redirect('/dashboard/login');
}

function requireDashboardAdmin(req, res, next) {
  if (req.dashboardRole === 'admin') return next();
  return res.status(403).json({ message: 'acesso-negado' });
}

app.get('/health', (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/settings', (req, res) => {
  const state = read();
  res.json(state.settings);
});

app.post('/settings', (req, res) => {
  const state = read();
  const body = req.body || {};
  state.settings = {
    ...state.settings,
    ...body,
    blockedKeywords: body.blockedKeywords ? uniq(body.blockedKeywords) : state.settings.blockedKeywords,
    blockedSites: body.blockedSites ? uniq(body.blockedSites) : state.settings.blockedSites,
    allowedLinks: body.allowedLinks ? uniq(body.allowedLinks) : state.settings.allowedLinks,
    allowedDomains: body.allowedDomains ? uniq(body.allowedDomains) : state.settings.allowedDomains,
    tempAllowedLinks: body.tempAllowedLinks ? uniq(body.tempAllowedLinks) : state.settings.tempAllowedLinks
  };
  write(state);
  emitUpdate('settings');
  res.json(state.settings);
});

app.get('/settings/updates', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ updated: true, kind: 'bootstrap', at: new Date().toISOString() })}\n\n`);
  req.on('close', () => sseClients.delete(res));
});

app.get('/dashboard/updates', requireDashboardAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  dashboardSseClients.add(res);
  res.write(`data: ${JSON.stringify({ updated: true, kind: 'bootstrap', at: new Date().toISOString() })}\n\n`);
  req.on('close', () => dashboardSseClients.delete(res));
});

app.post('/release-requests', (req, res) => {
  const state = read();
  const result = upsertReleaseRequest(state, req.body || {});
  if (result.error) return res.status(400).json({ message: result.error });
  write(state);
  emitUpdate('requests');
  return res.status(result.created ? 201 : 200).json({ status: 'pendente', request: result.item, duplicate: !result.created });
});

app.get('/release-requests', (req, res) => {
  const state = read();
  res.json(state.releaseRequests);
});

app.post('/release-requests/:id/block', (req, res) => {
  const state = read();
  const id = String(req.params.id);
  const idx = state.releaseRequests.findIndex((r) => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ message: 'solicitacao-nao-encontrada' });

  const domain = state.releaseRequests[idx].domain;
  state.releaseRequests[idx].status = 'bloqueado_admin';
  state.settings.tempAllowedLinks = (state.settings.tempAllowedLinks || []).filter((d) => d !== domain);
  state.settings.allowedDomains = (state.settings.allowedDomains || []).filter((d) => d !== domain);
  state.settings.blockedSites = uniq([...(state.settings.blockedSites || []), domain]);
  write(state);
  emitUpdate('requests');
  return res.json(state.releaseRequests[idx]);
});

app.post('/release-requests/:id/approve', (req, res) => {
  const state = read();
  const id = String(req.params.id);
  const idx = state.releaseRequests.findIndex((r) => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ message: 'solicitacao-nao-encontrada' });

  const domain = parseDomain(state.releaseRequests[idx].domain);
  state.releaseRequests[idx].status = 'aprovado_admin';
  if (domain) {
    state.settings.tempAllowedLinks = (state.settings.tempAllowedLinks || []).filter((d) => d !== domain);
    state.settings.allowedDomains = uniq([...(state.settings.allowedDomains || []), domain]);
  }
  write(state);
  emitUpdate('requests');
  return res.json(state.releaseRequests[idx]);
});

app.post('/logs', (req, res) => {
  const item = queueLog({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...req.body
  });
  emitUpdate('logs');
  res.status(201).json(item);
});

app.get('/logs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    const rows = await readLogsFromNdjson({ limit });
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'erro-ao-consultar-logs' });
  }
});

app.post('/api/kanban/card', async (req, res) => {
  try {
    const card = normalizeKanbanCardInput(req.body, Date.now());
    if (!card) {
      return res.status(400).json({ message: 'card-invalido' });
    }
    if (!card.deleted && !card.departments.length) {
      return res.status(400).json({ message: 'departamento-obrigatorio' });
    }
    await upsertKanbanCard(card);
    emitUpdate('kanban', {
      channel: 'kanban',
      action: card.deleted ? 'delete' : 'upsert',
      card: buildKanbanSseCard(card)
    });
    return res.status(201).json({ saved: true, id: card.id, updated_at: card.updatedAt });
  } catch {
    return res.status(500).json({ message: 'erro-ao-salvar-card' });
  }
});

app.post('/api/kanban/cards/batch', async (req, res) => {
  const source = Array.isArray(req.body && req.body.cards) ? req.body.cards : [];
  if (!source.length) {
    return res.status(400).json({ message: 'cards-obrigatorio' });
  }
  const results = [];
  const updatedCards = [];
  try {
    for (const item of source) {
      const card = normalizeKanbanCardInput(item, Date.now());
      if (!card) continue;
      if (!card.deleted && !card.departments.length) continue;
      await upsertKanbanCard(card);
      results.push({ id: card.id, updated_at: card.updatedAt });
      updatedCards.push(buildKanbanSseCard(card));
    }
    if (updatedCards.length) {
      emitUpdate('kanban', {
        channel: 'kanban',
        action: 'batch',
        cards: updatedCards
      });
    }
    return res.status(201).json({ saved: true, count: results.length, cards: results });
  } catch {
    return res.status(500).json({ message: 'erro-ao-salvar-cards' });
  }
});

app.get('/api/kanban/cards', async (req, res) => {
  const department = normalizeKanbanText(req.query.department, 80);
  if (!department) {
    return res.status(400).json({ message: 'departamento-obrigatorio' });
  }
  try {
    const cards = await listKanbanCardsByDepartment(department);
    return res.json({ cards });
  } catch {
    return res.status(500).json({ message: 'erro-ao-consultar-cards' });
  }
});

app.post('/api/check-site', (req, res) => {
  const { domain } = req.body || {};
  const d = parseDomain(domain);
  const state = read();
  const blocked = isBlocked(d, state.settings.blockedSites);
  const allowed = isAllowed(d, state.settings.allowedDomains);
  if (blocked) return res.json({ status: 'blocked' });
  res.json({ status: allowed ? 'allowed' : 'blocked' });
});

app.post('/api/request-release', (req, res) => {
  const state = read();
  const result = upsertReleaseRequest(state, req.body || {});
  if (result.error) return res.status(400).json({ message: result.error });
  write(state);
  emitUpdate('requests');
  return res.status(result.created ? 201 : 200).json({ status: 'pendente', request: result.item, duplicate: !result.created });
});

app.post('/api/log-access', (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const { user_id, domain, status, browser, browserUser } = payload;
  const detailsFromBody = payload.details && typeof payload.details === 'object' ? payload.details : {};
  const dataFromBody = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const url = String(payload.url || payload.originalUrl || payload.href || detailsFromBody.url || detailsFromBody.href || dataFromBody.url || dataFromBody.href || '').trim();
  const title = String(payload.title || detailsFromBody.title || dataFromBody.title || '').trim();
  const item = queueLog({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type: 'access',
    user_id,
    browserUser: String(browserUser || user_id || '').trim(),
    browser: String(browser || 'Desconhecido').trim() || 'Desconhecido',
    domain,
    status,
    url: url || undefined,
    title: title || undefined,
    details: {
      ...detailsFromBody,
      ...dataFromBody,
      ...(url ? { url } : {}),
      ...(title ? { title } : {})
    }
  });
  emitUpdate('logs');
  res.status(201).json(item);
});

app.get('/dashboard/login', (req, res) => {
  const cookies = parseCookies(req);
  if (decodeSessionToken(cookies[sessionCookieName])) return res.redirect('/dashboard/');
  return res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

app.get('/dashboard/api/setup-status', (req, res) => {
  res.json({
    requiresSetup: requiresDashboardSetup(),
    setupUser: dashboardUser
  });
});

app.post('/dashboard/setup', (req, res) => {
  if (!requiresDashboardSetup()) {
    return res.status(409).json({ message: 'setup-ja-concluido' });
  }
  const password = String(req.body && req.body.password ? req.body.password : '');
  const confirmPassword = String(req.body && req.body.confirmPassword ? req.body.confirmPassword : '');
  if (!password.trim()) {
    return res.status(400).json({ message: 'senha-dashboard-obrigatoria' });
  }
  if (confirmPassword && !safeEqual(password, confirmPassword)) {
    return res.status(400).json({ message: 'confirmacao-invalida' });
  }
  const result = completeDashboardSetup(password);
  if (result.error === 'senha-dashboard-curta') {
    return res.status(400).json({ message: result.error });
  }
  setSessionCookie(res, dashboardUser, 'admin');
  return res.json({ ok: true, role: 'admin' });
});

app.post('/dashboard/login', (req, res) => {
  if (requiresDashboardSetup()) {
    return res.status(409).json({ message: 'setup-obrigatorio' });
  }
  const { username, password } = req.body || {};
  console.log(`[Login Attempt] User: "${username}", IP: ${req.ip}`);
  const resolvedLogin = resolveDashboardLogin(username, password);
  if (!resolvedLogin) {
    console.log(`[Login Failed] Invalid credentials for user: "${username}"`);
    return res.status(401).json({ message: 'credenciais-invalidas' });
  }
  console.log(`[Login Success] User: "${username}" as "${resolvedLogin.role}"`);
  setSessionCookie(res, resolvedLogin.username, resolvedLogin.role);
  return res.json({ ok: true, role: resolvedLogin.role });
});

app.post('/dashboard/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get('/dashboard/api/health', requireDashboardAuth, (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/dashboard/api/session', requireDashboardAuth, (req, res) => {
  res.json({ username: req.dashboardUser, role: req.dashboardRole || 'admin' });
});

app.get('/dashboard/api/settings', requireDashboardAuth, requireDashboardAdmin, (req, res) => {
  const state = read();
  res.json(state.settings);
});

app.post('/dashboard/api/settings', requireDashboardAuth, requireDashboardAdmin, (req, res) => {
  const state = read();
  const body = req.body || {};
  state.settings = {
    ...state.settings,
    ...body,
    blockedKeywords: body.blockedKeywords ? uniq(body.blockedKeywords) : state.settings.blockedKeywords,
    blockedSites: body.blockedSites ? uniq(body.blockedSites) : state.settings.blockedSites,
    allowedLinks: body.allowedLinks ? uniq(body.allowedLinks) : state.settings.allowedLinks,
    allowedDomains: body.allowedDomains ? uniq(body.allowedDomains) : state.settings.allowedDomains,
    tempAllowedLinks: body.tempAllowedLinks ? uniq(body.tempAllowedLinks) : state.settings.tempAllowedLinks
  };
  write(state);
  emitUpdate('settings');
  res.json(state.settings);
});

app.get('/dashboard/api/config', requireDashboardAuth, (req, res) => {
  const state = read();
  res.json({
    companyName: String(state.settings.companyName || 'Organife'),
    companyNotice: String(state.settings.companyNotice || ''),
    serverUrl: String(state.settings.serverUrl || 'http://localhost:1337'),
    quickLinks: Array.isArray(state.settings.quickLinks) ? state.settings.quickLinks : []
  });
});

app.post('/dashboard/api/config', requireDashboardAuth, (req, res) => {
  const state = read();
  const body = req.body || {};
  const canEditAllConfig = req.dashboardRole === 'admin';
  const allowedViewerKeys = ['companyNotice'];
  const sentKeys = Object.keys(body);
  if (!canEditAllConfig) {
    const hasForbiddenKey = sentKeys.some((key) => !allowedViewerKeys.includes(key));
    if (hasForbiddenKey) {
      return res.status(403).json({ message: 'acesso-negado' });
    }
  }
  if (canEditAllConfig && Object.prototype.hasOwnProperty.call(body, 'companyName')) {
    state.settings.companyName = String(body.companyName || '').trim() || 'Organife';
  }
  if (canEditAllConfig && Object.prototype.hasOwnProperty.call(body, 'serverUrl')) {
    state.settings.serverUrl = String(body.serverUrl || '').trim() || 'http://localhost:1337';
  }
  if (canEditAllConfig && Object.prototype.hasOwnProperty.call(body, 'quickLinks')) {
    state.settings.quickLinks = sanitizeQuickLinks(body.quickLinks);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'companyNotice')) {
    state.settings.companyNotice = String(body.companyNotice || '').trim();
  }
  write(state);
  emitUpdate('settings');
  return res.json({
    companyName: state.settings.companyName,
    companyNotice: String(state.settings.companyNotice || ''),
    serverUrl: state.settings.serverUrl,
    quickLinks: state.settings.quickLinks
  });
});

app.post('/dashboard/api/passwords', requireDashboardAuth, requireDashboardAdmin, (req, res) => {
  const body = req.body || {};
  const wantsDashboardPassword = String(body.newDashboardPassword || '').trim().length > 0;
  const wantsAdminPassword = String(body.newAdminPassword || '').trim().length > 0;
  const wantsViewerPassword = String(body.newViewerPassword || '').trim().length > 0;
  const wantsRestrictedPassword = String(body.newRestrictedPassword || '').trim().length > 0;
  if (!wantsDashboardPassword && !wantsAdminPassword && !wantsViewerPassword && !wantsRestrictedPassword) {
    return res.status(400).json({ message: 'senha-obrigatoria' });
  }

  const state = read();

  if (wantsDashboardPassword) {
    const currentDashboardPassword = String(body.currentDashboardPassword || '');
    const newDashboardPassword = String(body.newDashboardPassword || '').trim();
    if (!safeEqual(currentDashboardPassword, dashboardPassword)) {
      return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    }
    if (newDashboardPassword.length < 4) {
      return res.status(400).json({ message: 'senha-dashboard-curta' });
    }
    dashboardPassword = newDashboardPassword;
    dashboardSetupRequired = false;
    state.auth = { ...(state.auth || {}), dashboardPassword: newDashboardPassword };
  }

  if (wantsAdminPassword) {
    const currentDashboardPasswordForAdmin = String(body.currentDashboardPasswordForAdmin || body.currentDashboardPassword || '');
    const newAdminPassword = String(body.newAdminPassword || '').trim();
    if (!safeEqual(currentDashboardPasswordForAdmin, dashboardPassword)) {
      return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    }
    if (newAdminPassword.length < 4) {
      return res.status(400).json({ message: 'senha-admin-curta' });
    }
    state.settings.adminPassword = newAdminPassword;
  }

  if (wantsViewerPassword) {
    const currentDashboardPasswordForViewer = String(body.currentDashboardPasswordForViewer || body.currentDashboardPassword || '');
    const newViewerPassword = String(body.newViewerPassword || '').trim();
    if (!safeEqual(currentDashboardPasswordForViewer, dashboardPassword)) {
      return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    }
    if (newViewerPassword.length < 4) {
      return res.status(400).json({ message: 'senha-visualizacao-curta' });
    }
    dashboardViewerPassword = newViewerPassword;
    state.auth = { ...(state.auth || {}), dashboardViewerPassword: newViewerPassword };
  }

  if (wantsRestrictedPassword) {
    const currentDashboardPasswordForRestricted = String(body.currentDashboardPasswordForRestricted || body.currentDashboardPassword || '');
    const newRestrictedPassword = String(body.newRestrictedPassword || '').trim();
    if (!safeEqual(currentDashboardPasswordForRestricted, dashboardPassword)) {
      return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    }
    if (newRestrictedPassword.length < 4) {
      return res.status(400).json({ message: 'senha-restrita-curta' });
    }
    state.settings.restrictedPassword = newRestrictedPassword;
  }

  write(state);
  emitUpdate('settings');
  return res.json({
    ok: true,
    dashboardPasswordChanged: wantsDashboardPassword,
    adminPasswordChanged: wantsAdminPassword,
    viewerPasswordChanged: wantsViewerPassword,
    restrictedPasswordChanged: wantsRestrictedPassword
  });
});

app.get('/dashboard/api/backup', requireDashboardAuth, requireDashboardAdmin, async (req, res) => {
  const state = read();
  try {
    const logs = await readLogsFromNdjson({ limit: 5000 });
    return res.json({
      auth: {
        dashboardPassword: String(state.auth && state.auth.dashboardPassword ? state.auth.dashboardPassword : ''),
        dashboardViewerPassword: String(state.auth && state.auth.dashboardViewerPassword ? state.auth.dashboardViewerPassword : '')
      },
      settings: {
        ...state.settings,
        quickLinks: Array.isArray(state.settings.quickLinks) ? state.settings.quickLinks : []
      },
      releaseRequests: Array.isArray(state.releaseRequests) ? state.releaseRequests : [],
      logs
    });
  } catch {
    return res.status(500).json({ message: 'erro-ao-gerar-backup' });
  }
});

app.post('/dashboard/api/restore', requireDashboardAuth, requireDashboardAdmin, async (req, res) => {
  const body = req.body || {};
  const state = read();

  const nextSettingsRaw = body.settings || {};
  const nextSettings = {
    ...state.settings,
    ...nextSettingsRaw,
    blockedKeywords: Array.isArray(nextSettingsRaw.blockedKeywords) ? uniq(nextSettingsRaw.blockedKeywords) : state.settings.blockedKeywords,
    blockedSites: Array.isArray(nextSettingsRaw.blockedSites) ? uniq(nextSettingsRaw.blockedSites) : state.settings.blockedSites,
    allowedLinks: Array.isArray(nextSettingsRaw.allowedLinks) ? uniq(nextSettingsRaw.allowedLinks) : state.settings.allowedLinks,
    allowedDomains: Array.isArray(nextSettingsRaw.allowedDomains) ? uniq(nextSettingsRaw.allowedDomains) : state.settings.allowedDomains,
    tempAllowedLinks: Array.isArray(nextSettingsRaw.tempAllowedLinks) ? uniq(nextSettingsRaw.tempAllowedLinks) : state.settings.tempAllowedLinks,
    companyName: String(nextSettingsRaw.companyName || state.settings.companyName || 'Organife').trim() || 'Organife',
    companyNotice: String(nextSettingsRaw.companyNotice || state.settings.companyNotice || '').trim(),
    serverUrl: String(nextSettingsRaw.serverUrl || state.settings.serverUrl || 'http://localhost:1337').trim() || 'http://localhost:1337',
    quickLinks: sanitizeQuickLinks(Array.isArray(nextSettingsRaw.quickLinks) ? nextSettingsRaw.quickLinks : state.settings.quickLinks)
  };

  state.settings = nextSettings;
  state.releaseRequests = Array.isArray(body.releaseRequests) ? body.releaseRequests : state.releaseRequests;
  state.logs = [];

  if (body.auth && typeof body.auth === 'object') {
    const restoredDashboardPassword = String(body.auth.dashboardPassword || '').trim();
    const restoredViewerPassword = String(body.auth.dashboardViewerPassword || '').trim();
    state.auth = {
      ...(state.auth || {}),
      dashboardPassword: restoredDashboardPassword,
      dashboardViewerPassword: restoredViewerPassword
    };
    if (restoredDashboardPassword) {
      dashboardPassword = restoredDashboardPassword;
      dashboardSetupRequired = false;
    } else {
      dashboardSetupRequired = true;
      dashboardPassword = dashboardPasswordDefault;
    }
    if (restoredViewerPassword) dashboardViewerPassword = restoredViewerPassword;
  }

  try {
    await replaceNdjsonLogs(Array.isArray(body.logs) ? body.logs : []);
    write(state);
    emitUpdate('all');
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ message: 'erro-ao-restaurar' });
  }
});

app.get('/dashboard/api/release-requests', requireDashboardAuth, (req, res) => {
  const state = read();
  const user = normalizeText(req.query.user || '');
  const rows = (Array.isArray(state.releaseRequests) ? state.releaseRequests : []).filter((row) => {
    if (!user) return true;
    return normalizeText(row.user || '').includes(user);
  });
  res.json(rows);
});

app.post('/dashboard/api/release-requests/:id/block', requireDashboardAuth, (req, res) => {
  const state = read();
  const id = String(req.params.id);
  const idx = state.releaseRequests.findIndex((r) => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ message: 'solicitacao-nao-encontrada' });

  const domain = String(state.releaseRequests[idx].domain || '').trim();
  state.releaseRequests[idx].status = 'bloqueado_admin';
  state.settings.tempAllowedLinks = removeDomainFromList(state.settings.tempAllowedLinks, domain);
  state.settings.allowedDomains = removeDomainFromList(state.settings.allowedDomains, domain);
  state.settings.blockedSites = uniq([...(state.settings.blockedSites || []), domain]);
  write(state);
  emitUpdate('requests');
  return res.json(state.releaseRequests[idx]);
});

app.post('/dashboard/api/release-requests/:id/approve', requireDashboardAuth, (req, res) => {
  const state = read();
  const id = String(req.params.id);
  const idx = state.releaseRequests.findIndex((r) => String(r.id) === id);
  if (idx < 0) return res.status(404).json({ message: 'solicitacao-nao-encontrada' });

  const domain = String(state.releaseRequests[idx].domain || '').trim();
  state.releaseRequests[idx].status = 'aprovado_admin';
  if (domain) {
    state.settings.tempAllowedLinks = removeDomainFromList(state.settings.tempAllowedLinks, domain);
    state.settings.blockedSites = removeDomainFromList(state.settings.blockedSites, domain);
    const normalizedDomain = parseDomain(domain);
    state.settings.allowedDomains = uniq([...(state.settings.allowedDomains || []), normalizedDomain || domain]);
  }
  write(state);
  emitUpdate('requests');
  return res.json(state.releaseRequests[idx]);
});

app.get('/dashboard/api/logs', requireDashboardAuth, async (req, res) => {
  try {
    const rows = await readLogsFromNdjson({
      limit: Math.max(1, Math.min(1000, Number(req.query.limit) || 200)),
      q: req.query.q,
      type: req.query.type,
      domain: req.query.domain,
      user: req.query.user,
      users: req.query.users,
      allUsers: req.query.allUsers
    });
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'erro-ao-consultar-logs' });
  }
});

app.get('/dashboard/api/logs/by-user-day', requireDashboardAuth, async (req, res) => {
  try {
    const requestedDay = normalizeDayKey(req.query.day || '');
    const rows = await readLogsByDayKeys(
      [requestedDay || toDayKey(new Date())],
      {
        limit: Math.max(1, Math.min(1000, Number(req.query.limit) || 200)),
        q: req.query.q,
        type: req.query.type,
        domain: req.query.domain,
        user: req.query.user,
        users: req.query.users,
        allUsers: req.query.allUsers
      }
    );
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'erro-ao-consultar-logs' });
  }
});

app.get('/dashboard/', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/index.html'));
});

app.get('/dashboard/app.js', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/app.js'));
});

app.get('/dashboard/styles.css', requireDashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/styles.css'));
});

app.get('/', (req, res) => {
  res.redirect('/dashboard/');
});

async function initializeLogStore() {
  await fs.promises.mkdir(logsDir, { recursive: true });
  await migrateLegacyLogsFromRuntimeState();
  await cleanupOldLogFiles();
  setInterval(() => {
    void cleanupOldLogFiles();
  }, 60 * 60 * 1000);
}

Promise.all([
  initializeLogStore(),
  initializeKanbanStore()
])
  .catch(() => {})
  .finally(() => {
    app.listen(port, '0.0.0.0', () => {
      process.stdout.write(`Server running on http://0.0.0.0:${port}\n`);
    });
  });
