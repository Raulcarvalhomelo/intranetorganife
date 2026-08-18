'use strict';

const SESSION_GAP_MS = 10 * 60 * 1000;
const EVENT_TAIL_MS = 2 * 60 * 1000;
const MAX_EVENT_CONTRIBUTION_MS = 10 * 60 * 1000;

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function asTimestamp(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getUser(log) {
  const item = asObject(log);
  return String(item.browserUser || item.windowsUser || item.user || item.user_id || 'unknown-user').trim() || 'unknown-user';
}

function getDetails(log) {
  const item = asObject(log);
  return asObject(item.details);
}

function normalizeDomain(log) {
  const item = asObject(log);
  const details = getDetails(item);
  const raw = String(item.domain || details.domain || details.hostname || details.url || item.url || '').trim().toLowerCase();
  if (!raw) return 'sem-dominio';
  try {
    const candidate = raw.indexOf('://') >= 0 ? raw : `https://${raw}`;
    const host = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
    return host || 'sem-dominio';
  } catch (error) {
    return raw.split('/')[0].split(':')[0].replace(/^www\./, '') || 'sem-dominio';
  }
}

function getEventTime(log) {
  const item = asObject(log);
  const numeric = Number(item.timestampMs);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return asTimestamp(item.timestamp);
}

function normalizeEvent(log, index) {
  const item = asObject(log);
  const timestampMs = getEventTime(item);
  if (!timestampMs) return null;
  const details = getDetails(item);
  const action = String(item.action || item.type || 'activity').trim().toLowerCase() || 'activity';
  return {
    eventId: String(item.id || item.eventId || `${timestampMs}-${index}`),
    user: getUser(item),
    browser: String(item.browser || 'Desconhecido'),
    domain: normalizeDomain(item),
    action,
    timestampMs,
    timestamp: new Date(timestampMs).toISOString(),
    url: String(details.url || item.url || ''),
    source: 'existing-log'
  };
}

function uniqueEvents(logs) {
  const seen = new Set();
  return (Array.isArray(logs) ? logs : [])
    .map(normalizeEvent)
    .filter((event) => {
      if (!event || seen.has(event.eventId)) return false;
      seen.add(event.eventId);
      return true;
    })
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function createSessions(events) {
  const sessions = [];
  const byUser = new Map();
  events.forEach((event) => {
    const key = `${event.user}\u0000${event.domain}`;
    const list = byUser.get(key) || [];
    list.push(event);
    byUser.set(key, list);
  });
  byUser.forEach((items) => {
    let current = null;
    items.forEach((event) => {
      if (!current || event.timestampMs - current.lastEventMs > SESSION_GAP_MS) {
        if (current) sessions.push(current);
        current = {
          id: `${event.user}-${event.timestampMs}-${sessions.length}`,
          user: event.user,
          domain: event.domain,
          browser: event.browser,
          startedAtMs: event.timestampMs,
          endedAtMs: event.timestampMs + EVENT_TAIL_MS,
          eventCount: 1,
          state: 'observed',
          lastEventMs: event.timestampMs
        };
        return;
      }
      current.endedAtMs = Math.min(event.timestampMs + EVENT_TAIL_MS, current.endedAtMs + MAX_EVENT_CONTRIBUTION_MS, event.timestampMs + EVENT_TAIL_MS);
      current.eventCount += 1;
      current.lastEventMs = event.timestampMs;
    });
    if (current) sessions.push(current);
  });
  return sessions
    .map((session) => Object.assign({}, session, {
      startedAt: new Date(session.startedAtMs).toISOString(),
      endedAt: new Date(session.endedAtMs).toISOString(),
      durationMs: Math.max(0, session.endedAtMs - session.startedAtMs)
    }))
    .sort((left, right) => left.startedAtMs - right.startedAtMs);
}

function aggregateDomains(sessions) {
  const values = new Map();
  sessions.forEach((session) => {
    const current = values.get(session.domain) || { domain: session.domain, durationMs: 0, sessions: 0, events: 0 };
    current.durationMs += session.durationMs;
    current.sessions += 1;
    current.events += session.eventCount;
    values.set(session.domain, current);
  });
  return Array.from(values.values()).sort((left, right) => right.durationMs - left.durationMs);
}

function buildActivity(logs) {
  const events = uniqueEvents(logs);
  const sessions = createSessions(events);
  const users = new Set(events.map((event) => event.user));
  const observedMs = sessions.reduce((total, session) => total + session.durationMs, 0);
  return {
    generatedAt: new Date().toISOString(),
    events: events.length,
    sessions: sessions.length,
    users: users.size,
    observedMs,
    observedMinutes: Math.round(observedMs / 60000),
    domains: aggregateDomains(sessions),
    timeline: sessions.map((session) => ({
      id: session.id,
      user: session.user,
      domain: session.domain,
      browser: session.browser,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMs: session.durationMs,
      eventCount: session.eventCount,
      state: session.state
    }))
  };
}

module.exports = {
  SESSION_GAP_MS,
  EVENT_TAIL_MS,
  normalizeEvent,
  createSessions,
  buildActivity
};
