'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { loadConfig } = require('./config');
const { createStateStore } = require('./state');
const { createAuthService } = require('./auth');
const { createRealtimeServer } = require('./realtime');
const { createLogStore } = require('./log-store');
const { createKanbanStore } = require('./kanban-store');
const { createSettingsRouter } = require('./routes/settings');
const { createReleaseRouter } = require('./routes/releases');
const { createLogsRouter } = require('./routes/logs');
const { createKanbanRouter } = require('./routes/kanban');

const config = loadConfig();
const stateStore = createStateStore({ dataDir: config.databaseDir });
const authService = createAuthService({
  stateStore,
  dashboardUser: config.dashboardUser,
  dashboardPasswordDefault: config.dashboardPasswordDefault,
  dashboardViewerUser: config.dashboardViewerUser,
  dashboardViewerPasswordDefault: config.dashboardViewerPasswordDefault,
  sessionSecret: config.dashboardSessionSecret,
  secureCookie: config.dashboardCookieSecure
});
const logStore = createLogStore({
  logsDir: config.logsDir,
  retentionDays: config.logRetentionDays,
  flushIntervalMs: config.logFlushIntervalMs
});
const kanbanStore = createKanbanStore({
  databasePath: config.kanbanDatabasePath,
  snapshotsDir: config.snapshotsDir
});
const app = express();
let realtimeServer = null;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function emitUpdate(kind, extra) {
  if (!realtimeServer) return;
  const payload = Object.assign({ updated: true, kind: kind || 'all', at: new Date().toISOString() }, extra || {});
  realtimeServer.broadcast({ type: 'state_update', payload });
}

function normalizeDomain(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (raw.indexOf('://') >= 0) return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {}
  return raw.split('/')[0].split(':')[0].replace(/^www\./, '');
}

function domainMatches(domain, pattern) {
  const host = normalizeDomain(domain);
  const source = String(pattern || '').trim().toLowerCase().replace(/^www\./, '');
  if (!host || !source) return false;
  if (source === '*') return true;
  if (source.indexOf('*.') === 0) {
    const suffix = source.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  if (source.indexOf('*') < 0) return host === source;
  const escaped = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(host);
}

function matchesAny(domain, values) {
  return (Array.isArray(values) ? values : []).some((entry) => domainMatches(domain, entry));
}

function uniqueList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || '').trim()).filter(Boolean)));
}

function sanitizeQuickLinks(value) {
  return (Array.isArray(value) ? value : []).map((entry) => ({
    name: String(entry && entry.name || '').trim(),
    url: String(entry && entry.url || '').trim()
  })).filter((entry) => entry.name && entry.url);
}

function mergeDashboardConfig(state, body) {
  const source = body && typeof body === 'object' ? body : {};
  const current = state.settings || {};
  if (Object.prototype.hasOwnProperty.call(source, 'companyName')) current.companyName = String(source.companyName || '').trim() || 'Organife';
  if (Object.prototype.hasOwnProperty.call(source, 'serverUrl')) current.serverUrl = String(source.serverUrl || '').trim() || 'http://localhost:1337';
  if (Object.prototype.hasOwnProperty.call(source, 'quickLinks')) current.quickLinks = sanitizeQuickLinks(source.quickLinks);
  if (Object.prototype.hasOwnProperty.call(source, 'companyNotice')) current.companyNotice = String(source.companyNotice || '').trim();
  return current;
}

function mergeRestoredSettings(current, incoming) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const next = Object.assign({}, current || {}, source);
  ['blockedKeywords', 'blockedSites', 'allowedLinks', 'allowedDomains', 'tempAllowedLinks'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = uniqueList(source[key]);
    else next[key] = uniqueList((current || {})[key]);
  });
  next.companyName = String(source.companyName || (current && current.companyName) || 'Organife').trim() || 'Organife';
  next.companyNotice = String(source.companyNotice || (current && current.companyNotice) || '').trim();
  next.serverUrl = String(source.serverUrl || (current && current.serverUrl) || 'http://localhost:1337').trim() || 'http://localhost:1337';
  next.quickLinks = sanitizeQuickLinks(Array.isArray(source.quickLinks) ? source.quickLinks : (current && current.quickLinks));
  return next;
}

function isBlocked(domain, settings) {
  return matchesAny(domain, settings && settings.blockedSites);
}

function isAllowed(domain, settings) {
  return matchesAny(domain, settings && settings.allowedDomains);
}

app.get('/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));
app.post('/api/check-site', (req, res) => {
  const state = stateStore.read();
  const domain = normalizeDomain(req.body && req.body.domain);
  if (isBlocked(domain, state.settings)) return res.json({ status: 'blocked' });
  return res.json({ status: isAllowed(domain, state.settings) ? 'allowed' : 'blocked' });
});

app.get('/dashboard/login', (req, res) => {
  if (authService.getRequestSession(req)) return res.redirect('/dashboard/');
  return res.sendFile(path.join(__dirname, '../dashboard/login.html'));
});

app.get('/dashboard/api/setup-status', (req, res) => res.json({
  requiresSetup: authService.requiresSetup(),
  setupUser: authService.getDashboardUser()
}));

app.post('/dashboard/setup', (req, res) => {
  if (!authService.requiresSetup()) return res.status(409).json({ message: 'setup-ja-concluido' });
  const password = String(req.body && req.body.password || '');
  const confirmPassword = String(req.body && req.body.confirmPassword || '');
  if (!password.trim()) return res.status(400).json({ message: 'senha-dashboard-obrigatoria' });
  if (confirmPassword && !authService.safeEqual(password, confirmPassword)) return res.status(400).json({ message: 'confirmacao-invalida' });
  const result = authService.completeSetup(password);
  if (result.error) return res.status(400).json({ message: result.error });
  authService.setSessionCookie(res, authService.getDashboardUser(), 'admin');
  return res.json({ ok: true, role: 'admin' });
});

app.post('/dashboard/login', (req, res) => {
  if (authService.requiresSetup()) return res.status(409).json({ message: 'setup-obrigatorio' });
  const credentials = req.body || {};
  const login = authService.resolveLogin(credentials.username, credentials.password);
  if (!login) return res.status(401).json({ message: 'credenciais-invalidas' });
  authService.setSessionCookie(res, login.username, login.role);
  return res.json({ ok: true, role: login.role });
});

app.post('/dashboard/logout', (req, res) => {
  authService.clearSessionCookie(res);
  return res.status(204).send();
});

app.get('/dashboard/api/health', authService.requireAuth, (req, res) => res.json({ ok: true, now: new Date().toISOString() }));
app.get('/dashboard/api/session', authService.requireAuth, (req, res) => res.json({ username: req.dashboardUser, role: req.dashboardRole }));

app.get('/dashboard/api/config', authService.requireAuth, (req, res) => {
  const settings = stateStore.read().settings;
  return res.json({
    companyName: String(settings.companyName || 'Organife'),
    companyNotice: String(settings.companyNotice || ''),
    serverUrl: String(settings.serverUrl || 'http://localhost:1337'),
    quickLinks: Array.isArray(settings.quickLinks) ? settings.quickLinks : []
  });
});

app.post('/dashboard/api/config', authService.requireAuth, (req, res) => {
  const source = req.body && typeof req.body === 'object' ? req.body : {};
  const allowedViewerKeys = ['companyNotice'];
  if (!authService.isAdmin(req.dashboardRole) && Object.keys(source).some((key) => allowedViewerKeys.indexOf(key) < 0)) return res.status(403).json({ message: 'acesso-negado' });
  const state = stateStore.read();
  mergeDashboardConfig(state, source);
  stateStore.write(state);
  emitUpdate('settings');
  return res.json({
    companyName: state.settings.companyName,
    companyNotice: state.settings.companyNotice,
    serverUrl: state.settings.serverUrl,
    quickLinks: state.settings.quickLinks
  });
});

app.post('/dashboard/api/passwords', authService.requireAuth, authService.requireAdmin, (req, res) => {
  const body = req.body || {};
  const wantsDashboard = String(body.newDashboardPassword || '').trim();
  const wantsAdmin = String(body.newAdminPassword || '').trim();
  const wantsViewer = String(body.newViewerPassword || '').trim();
  const wantsRestricted = String(body.newRestrictedPassword || '').trim();
  if (!wantsDashboard && !wantsAdmin && !wantsViewer && !wantsRestricted) return res.status(400).json({ message: 'senha-obrigatoria' });
  const state = stateStore.read();
  if (wantsDashboard) {
    if (!authService.safeEqual(body.currentDashboardPassword || '', authService.getDashboardPassword())) return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    if (wantsDashboard.length < 4) return res.status(400).json({ message: 'senha-dashboard-curta' });
    authService.setDashboardPassword(wantsDashboard);
    state.auth.dashboardPassword = wantsDashboard;
  }
  if (wantsAdmin) {
    const current = body.currentDashboardPasswordForAdmin || body.currentDashboardPassword || '';
    if (!authService.safeEqual(current, authService.getDashboardPassword())) return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    if (wantsAdmin.length < 4) return res.status(400).json({ message: 'senha-admin-curta' });
    state.settings.adminPassword = wantsAdmin;
  }
  if (wantsViewer) {
    const current = body.currentDashboardPasswordForViewer || body.currentDashboardPassword || '';
    if (!authService.safeEqual(current, authService.getDashboardPassword())) return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    if (wantsViewer.length < 4) return res.status(400).json({ message: 'senha-visualizacao-curta' });
    authService.setViewerPassword(wantsViewer);
    state.auth.dashboardViewerPassword = wantsViewer;
  }
  if (wantsRestricted) {
    const current = body.currentDashboardPasswordForRestricted || body.currentDashboardPassword || '';
    if (!authService.safeEqual(current, authService.getDashboardPassword())) return res.status(401).json({ message: 'senha-dashboard-atual-invalida' });
    if (wantsRestricted.length < 4) return res.status(400).json({ message: 'senha-restrita-curta' });
    state.settings.restrictedPassword = wantsRestricted;
  }
  stateStore.write(state);
  emitUpdate('settings');
  return res.json({ ok: true, dashboardPasswordChanged: Boolean(wantsDashboard), adminPasswordChanged: Boolean(wantsAdmin), viewerPasswordChanged: Boolean(wantsViewer), restrictedPasswordChanged: Boolean(wantsRestricted) });
});

app.get('/dashboard/api/backup', authService.requireAuth, authService.requireAdmin, async (req, res) => {
  try {
    const state = stateStore.read();
    return res.json({
      auth: {
        dashboardPassword: String(state.auth.dashboardPassword || ''),
        dashboardViewerPassword: String(state.auth.dashboardViewerPassword || '')
      },
      settings: Object.assign({}, state.settings, { quickLinks: sanitizeQuickLinks(state.settings.quickLinks) }),
      releaseRequests: Array.isArray(state.releaseRequests) ? state.releaseRequests : [],
      logs: await logStore.readLogs({ limit: 5000 })
    });
  } catch (error) {
    return res.status(500).json({ message: 'erro-ao-gerar-backup' });
  }
});

app.post('/dashboard/api/restore', authService.requireAuth, authService.requireAdmin, async (req, res) => {
  const body = req.body || {};
  const state = stateStore.read();
  state.settings = mergeRestoredSettings(state.settings, body.settings || {});
  state.releaseRequests = Array.isArray(body.releaseRequests) ? body.releaseRequests : state.releaseRequests;
  if (body.auth && typeof body.auth === 'object') {
    const dashboardPassword = String(body.auth.dashboardPassword || '').trim();
    const viewerPassword = String(body.auth.dashboardViewerPassword || '').trim();
    state.auth = Object.assign({}, state.auth, { dashboardPassword, dashboardViewerPassword: viewerPassword });
    if (dashboardPassword) {
      authService.setDashboardPassword(dashboardPassword);
    }
    if (viewerPassword) authService.setViewerPassword(viewerPassword);
  }
  try {
    await logStore.replaceLogs(Array.isArray(body.logs) ? body.logs : []);
    stateStore.write(state);
    authService.updatePasswords(state);
    emitUpdate('all');
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'erro-ao-restaurar' });
  }
});

app.use(createSettingsRouter({
  stateStore,
  emitUpdate,
  requireAuth: authService.requireAuth,
  requireAdmin: authService.requireAdmin
}));
app.use(createReleaseRouter({
  stateStore,
  emitUpdate,
  requireAuth: authService.requireAuth
}));
app.use(createLogsRouter({
  logStore,
  emitUpdate,
  requireAuth: authService.requireAuth
}));
app.use(createKanbanRouter({ kanbanStore, normalizeCard: kanbanStore.normalizeCard, emitUpdate }));

app.get('/dashboard/', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/index.html')));
app.get('/dashboard/app.js', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/app.js')));
app.get('/dashboard/styles.css', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/styles.css')));
app.get('/dashboard/dashboard-auth.js', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/dashboard-auth.js')));
app.get('/dashboard/dashboard-logs.js', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/dashboard-logs.js')));
app.get('/dashboard/dashboard-monitoring.js', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/dashboard-monitoring.js')));
app.get('/dashboard/dashboard-config.js', authService.requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../dashboard/dashboard-config.js')));
app.get('/', (req, res) => res.redirect('/dashboard/'));

async function migrateLegacyRuntimeLogs() {
  const state = stateStore.read();
  if (!Array.isArray(state.logs) || !state.logs.length) return;
  await logStore.replaceLogs(state.logs);
  state.logs = [];
  stateStore.write(state);
}

async function start() {
  await logStore.initialize();
  await migrateLegacyRuntimeLogs();
  await kanbanStore.initialize();
  const server = http.createServer(app);
  realtimeServer = createRealtimeServer(server, {
    authenticate: authService.authenticateWebSocket,
    onHello: (socket) => {
      const state = stateStore.read();
      realtimeServer.send(socket, { type: 'settings_state', payload: state.settings });
    },
    onMessage: (socket, message) => {
      if (message.type === 'logs_batch' && socket.room === 'extension' && Array.isArray(message.logs)) {
        const logs = logStore.queueLogs(message.logs);
        realtimeServer.send(socket, { type: 'logs_ack', count: logs.length });
        emitUpdate('logs');
        return;
      }
      if (message.type === 'request_state') {
        const state = stateStore.read();
        realtimeServer.send(socket, { type: 'settings_state', payload: state.settings });
      }
    }
  });
  server.on('close', () => {
    if (realtimeServer) realtimeServer.close();
    logStore.close().catch(() => {});
    kanbanStore.close().catch(() => {});
  });
  server.listen(config.port, '0.0.0.0', () => process.stdout.write(`Server running on http://0.0.0.0:${config.port}\n`));
}

start().catch((error) => {
  process.stderr.write(`Server startup failed: ${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});

module.exports = { app, start };
