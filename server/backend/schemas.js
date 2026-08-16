'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value, fallback) {
  if (value === undefined || value === null) return fallback || '';
  return String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function uniqueStrings(value, max) {
  const seen = new Set();
  const result = [];
  asArray(value).forEach((entry) => {
    const item = asString(entry, '').trim();
    if (!item || seen.has(item)) return;
    seen.add(item);
    result.push(item);
  });
  return max ? result.slice(0, max) : result;
}

function normalizeLogDetails(input) {
  const source = isPlainObject(input) ? input : {};
  const details = {};
  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (value === undefined || typeof value === 'function') return;
    details[key] = value;
  });
  return details;
}

function normalizeLogEvent(input) {
  const source = isPlainObject(input) ? input : {};
  const detailsSource = isPlainObject(source.details)
    ? source.details
    : (isPlainObject(source.data) ? source.data : {});
  const id = source.id === undefined || source.id === null || source.id === ''
    ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : source.id;
  return {
    id,
    timestamp: safeTimestamp(source.timestamp),
    windowsUser: asString(source.windowsUser || source.user_id, '').trim(),
    browserUser: asString(source.browserUser || source.user, '').trim(),
    browser: asString(source.browser || source.browserName, '').trim(),
    action: asString(source.action || source.type, '').trim(),
    details: normalizeLogDetails(detailsSource)
  };
}

function validateLogEvent(input) {
  const event = normalizeLogEvent(input);
  return Boolean(event.timestamp && event.action);
}

function normalizeKanbanCard(input) {
  const source = isPlainObject(input) ? input : {};
  const id = asString(source.id, '').trim();
  const statusValue = asString(source.status, 'todo').trim().toLowerCase();
  const priorityValue = asString(source.priority, 'med').trim().toLowerCase();
  const updatedAtValue = Number(source.updated_at !== undefined ? source.updated_at : source.updatedAt);
  const createdAtValue = Number(source.created_at !== undefined ? source.created_at : source.createdAt);
  const departments = uniqueStrings(source.departments || (source.department ? [source.department] : []), 20);
  return {
    id,
    title: asString(source.title || source.text, '').trim(),
    description: asString(source.description, '').trim(),
    status: ['backlog', 'todo', 'doing', 'done'].includes(statusValue) ? statusValue : 'todo',
    priority: ['low', 'med', 'high', 'urgent'].includes(priorityValue) ? priorityValue : 'med',
    due_at: Number(source.due_at !== undefined ? source.due_at : source.dueAt) || 0,
    tags: uniqueStrings(source.tags, 20),
    attachments: asArray(source.attachments).filter(isPlainObject).slice(0, 20),
    depends_on: uniqueStrings(source.depends_on || source.dependsOn, 20).filter((value) => value !== id),
    sprint_id: asString(source.sprint_id !== undefined ? source.sprint_id : source.sprintId, '').trim(),
    assigned_to: asString(source.assigned_to !== undefined ? source.assigned_to : source.assignedTo, '').trim() || null,
    recurrence: isPlainObject(source.recurrence) ? source.recurrence : { type: 'none', lastTrigger: 0 },
    created_at: Number.isFinite(createdAtValue) && createdAtValue > 0 ? createdAtValue : Date.now(),
    updated_at: Number.isFinite(updatedAtValue) && updatedAtValue > 0 ? updatedAtValue : Date.now(),
    deleted: Number(source.deleted) === 1 || source.deleted === true ? 1 : 0,
    departments
  };
}

function validateKanbanCard(input) {
  const card = normalizeKanbanCard(input);
  return Boolean(card.id && (card.deleted === 1 || card.departments.length > 0));
}

function normalizeKanbanBoard(input) {
  const source = isPlainObject(input) ? input : {};
  const cards = asArray(source.cards || source.todos).map(normalizeKanbanCard).filter((card) => card.id);
  return {
    id: asString(source.id, '').trim(),
    title: asString(source.title || source.name, '').trim(),
    department: asString(source.department, '').trim(),
    cards,
    updatedAt: Number(source.updatedAt || source.updated_at) || Date.now()
  };
}

function validateKanbanBoard(input) {
  const board = normalizeKanbanBoard(input);
  return Boolean(board.title || board.id || board.department);
}

function normalizeSettings(input) {
  const source = isPlainObject(input) ? input : {};
  return {
    blockedSites: uniqueStrings(source.blockedSites),
    allowedDomains: uniqueStrings(source.allowedDomains),
    tempAllowedLinks: uniqueStrings(source.tempAllowedLinks),
    allowedLinks: uniqueStrings(source.allowedLinks),
    blockedKeywords: uniqueStrings(source.blockedKeywords),
    totalBlockMode: Boolean(source.totalBlockMode),
    browserUser: asString(source.browserUser, '').trim(),
    companyName: asString(source.companyName, 'Organife').trim() || 'Organife',
    companyNotice: asString(source.companyNotice, '').trim(),
    serverUrl: asString(source.serverUrl, '').trim(),
    quickLinks: asArray(source.quickLinks).filter(isPlainObject).map((entry) => ({
      name: asString(entry.name, '').trim(),
      url: asString(entry.url, '').trim()
    })).filter((entry) => entry.name && entry.url)
  };
}

function validateSettings(input) {
  const settings = normalizeSettings(input);
  return Array.isArray(settings.blockedSites) && Array.isArray(settings.allowedDomains);
}

module.exports = {
  isPlainObject,
  asString,
  asArray,
  normalizeLogEvent,
  validateLogEvent,
  normalizeKanbanCard,
  validateKanbanCard,
  normalizeKanbanBoard,
  validateKanbanBoard,
  normalizeSettings,
  validateSettings
};
