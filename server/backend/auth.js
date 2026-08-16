'use strict';

const crypto = require('crypto');

function createAuthService(options) {
  const config = options || {};
  const stateStore = config.stateStore;
  const dashboardUser = String(config.dashboardUser || 'admin');
  const viewerUser = String(config.dashboardViewerUser || 'visualizacao');
  const defaultPassword = String(config.dashboardPasswordDefault || 'admin123');
  const defaultViewerPassword = String(config.dashboardViewerPasswordDefault || 'visual1234');
  const sessionSecret = String(config.sessionSecret || crypto.randomBytes(32).toString('hex'));
  const cookieName = String(config.cookieName || 'dashboard_session');
  const sessionTtlMs = Number(config.sessionTtlMs) || 1000 * 60 * 60 * 12;
  const secureCookie = Boolean(config.secureCookie);
  const initialState = stateStore.read();
  const initialAuth = initialState.auth || {};
  let dashboardPassword = String(initialAuth.dashboardPassword || '').trim() || defaultPassword;
  let dashboardViewerPassword = String(initialAuth.dashboardViewerPassword || '').trim() || defaultViewerPassword;
  let setupRequired = !String(initialAuth.dashboardPassword || '').trim();

  function isAdmin(role) { return String(role || '') === 'admin'; }
  function canRead(role) { return isAdmin(role) || String(role || '') === 'viewer'; }
  function canWrite(role) { return isAdmin(role); }

  function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  function sign(value) {
    return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
  }

  function parseCookies(req) {
    const header = String(req && req.headers && req.headers.cookie || '');
    const result = {};
    header.split(';').forEach((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return;
      const key = part.slice(0, index).trim();
      try {
        result[key] = decodeURIComponent(part.slice(index + 1).trim());
      } catch (error) {
        result[key] = part.slice(index + 1).trim();
      }
    });
    return result;
  }

  function encodeSession(username, role) {
    const expiresAt = Date.now() + sessionTtlMs;
    const identity = `${username}|${role}`;
    const payload = `${identity}.${expiresAt}`;
    return Buffer.from(`${payload}.${sign(payload)}`).toString('base64');
  }

  function decodeSession(token) {
    if (!token) return null;
    try {
      const decoded = Buffer.from(String(token), 'base64').toString('utf8');
      const parts = decoded.split('.');
      if (parts.length < 3) return null;
      const signature = parts.pop();
      const expiresAt = Number(parts.pop());
      const identity = parts.join('.');
      const separator = identity.lastIndexOf('|');
      const username = separator >= 0 ? identity.slice(0, separator) : identity;
      const role = separator >= 0 ? identity.slice(separator + 1) : 'admin';
      if (!username || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      const payload = `${identity}.${expiresAt}`;
      if (!safeEqual(signature, sign(payload))) return null;
      return { username, role: role || 'admin', expiresAt };
    } catch (error) {
      return null;
    }
  }

  function getRequestSession(req) {
    const cookies = parseCookies(req);
    return decodeSession(cookies[cookieName]);
  }

  function setSessionCookie(res, username, role) {
    const token = encodeSession(username, role || 'admin');
    let value = `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}`;
    if (secureCookie) value += '; Secure';
    res.setHeader('Set-Cookie', value);
  }

  function clearSessionCookie(res) {
    let value = `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
    if (secureCookie) value += '; Secure';
    res.setHeader('Set-Cookie', value);
  }

  function resolveLogin(username, password) {
    const candidateUser = String(username || '');
    const candidatePassword = String(password || '');
    if (safeEqual(candidateUser, dashboardUser) && safeEqual(candidatePassword, dashboardPassword)) return { username: dashboardUser, role: 'admin' };
    if (safeEqual(candidateUser, viewerUser) && safeEqual(candidatePassword, dashboardViewerPassword)) return { username: viewerUser, role: 'viewer' };
    return null;
  }

  function completeSetup(password) {
    const value = String(password || '').trim();
    if (value.length < 4) return { error: 'senha-dashboard-curta' };
    const state = stateStore.read();
    state.auth = Object.assign({}, state.auth || {}, { dashboardPassword: value });
    stateStore.write(state);
    dashboardPassword = value;
    setupRequired = false;
    return { ok: true };
  }

  function requireAuth(req, res, next) {
    const session = getRequestSession(req);
    if (session && canRead(session.role)) {
      req.dashboardUser = session.username;
      req.dashboardRole = session.role;
      return next();
    }
    if (String(req.path || '').includes('/dashboard/api/')) return res.status(401).json({ message: 'nao-autorizado' });
    return res.redirect('/dashboard/login');
  }

  function requireAdmin(req, res, next) {
    if (isAdmin(req.dashboardRole)) return next();
    return res.status(403).json({ message: 'acesso-negado' });
  }

  function authenticateWebSocket(socket, message, request) {
    if (message && message.client === 'extension') return true;
    const headers = request && request.headers ? request.headers : {};
    const session = getRequestSession({ headers });
    return Boolean(session && canRead(session.role));
  }

  function updatePasswords(state) {
    const auth = state.auth || {};
    if (auth.dashboardPassword) {
      dashboardPassword = String(auth.dashboardPassword);
      setupRequired = false;
    }
    if (auth.dashboardViewerPassword) dashboardViewerPassword = String(auth.dashboardViewerPassword);
  }

  return {
    isAdmin,
    canRead,
    canWrite,
    safeEqual,
    parseCookies,
    decodeSession,
    getRequestSession,
    setSessionCookie,
    clearSessionCookie,
    resolveLogin,
    completeSetup,
    requireAuth,
    requireAdmin,
    authenticateWebSocket,
    updatePasswords,
    getDashboardUser: () => dashboardUser,
    getViewerUser: () => viewerUser,
    getDashboardPassword: () => dashboardPassword,
    getViewerPassword: () => dashboardViewerPassword,
    setDashboardPassword: (value) => { dashboardPassword = String(value || ''); setupRequired = false; },
    setViewerPassword: (value) => { dashboardViewerPassword = String(value || ''); },
    requiresSetup: () => setupRequired,
    sessionTtlMs
  };
}

module.exports = { createAuthService };
