// Browser compatibility layer
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

let serverUrl = 'http://192.168.100.34:1337';
let adminPassword = 'gadu333'; // Default value - will be changed if backup/restore
let restrictedPassword = '';
let tempPassword = '654321';
let blockedKeywords = [];
let blockedSites = [];
let allowedLinks = [];
let allowedDomains = [];
let tempAllowedLinks = [];
let totalBlockMode = false;
let browserUser = '';
let companyName = 'Organife';
let companyNotice = '';
let quickLinks = [];
let currentSettings = {};
const EXEMPT_BROWSER_USER = 'diretoria';
const nativeFilePickerHostName = 'com.organife.filepicker';
const LOGS_DB_NAME = 'organife-extension-db';
const LOGS_DB_VERSION = 1;
const LOGS_STORE_NAME = 'activityLogs';
const KANBAN_REALTIME_DELTA_KEY = 'kanbanRealtimeDelta';
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LOG_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const BRASILIA_HOUR_CACHE_MS = 30 * 60 * 1000;
let browserUserLoaded = false;
let logsDbPromise = null;
let lastLogsCleanupAt = 0;
const EMPTY_COMPILED_PATTERNS = Object.freeze({
  rawEntries: [],
  domainMatchers: []
});
let blockedSitesCompiled = EMPTY_COMPILED_PATTERNS;
let allowedDomainsCompiled = EMPTY_COMPILED_PATTERNS;
let tempAllowedLinksCompiled = EMPTY_COMPILED_PATTERNS;
const NAVIGATION_DEDUPE_WINDOW_MS = 700;
const NAVIGATION_DEDUPE_MAX_ENTRIES = 2000;
const recentNavigationChecks = new Map();
let cachedWindowsUser = '';
let hasResolvedWindowsUser = false;
let windowsUserResolvePromise = null;
let cachedBrasiliaHour = null;
let cachedBrasiliaExpiresAt = 0;

function normalizeServerUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const u = new URL(withProtocol);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

function normalizeUserName(value) {
  return String(value || '').trim().toLowerCase();
}

function isExemptBrowserUser() {
  return normalizeUserName(browserUser) === EXEMPT_BROWSER_USER;
}

function hasBrowserUser() {
  return normalizeUserName(browserUser).length > 0;
}

function getCurrentBrowserName() {
  const userAgent = String((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Brave/')) return 'Brave';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Safari/')) return 'Safari';
  return 'Desconhecido';
}

function getIdentityPageBase() {
  return browserAPI.runtime.getURL('identity.html');
}

function getIdentityPageUrl(nextUrl) {
  const base = getIdentityPageBase();
  if (!nextUrl) return base;
  return `${base}?next=${encodeURIComponent(nextUrl)}`;
}

function isExtensionPage(url) {
  const extensionBase = browserAPI.runtime.getURL('');
  return String(url || '').startsWith(extensionBase);
}

function isIdentityIgnoredUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  const lower = raw.toLowerCase();
  if (raw.startsWith(getIdentityPageBase())) return true;
  if (lower.startsWith('chrome://')) return true;
  if (lower.startsWith('edge://')) return true;
  if (lower.startsWith('about:')) return true;
  if (lower.startsWith('devtools://')) return true;
  if (lower.startsWith('chrome-devtools://')) return true;
  return false;
}

function requiresIdentityEnforcement() {
  return browserUserLoaded && !hasBrowserUser();
}

function getStoredBrowserUser(callback) {
  browserAPI.storage.local.get(['browserUser'], (result) => {
    const storedUser = String((result && result.browserUser) || '').trim();
    callback(storedUser);
  });
}

function enforceIdentityWithStorageFallback(tabId, targetUrl) {
  if (isIdentityIgnoredUrl(targetUrl)) return false;
  if (requiresIdentityEnforcement()) {
    enforceIdentityForTab(tabId, targetUrl);
    return true;
  }
  if (browserUserLoaded) return false;
  getStoredBrowserUser((storedUser) => {
    browserUser = storedUser;
    browserUserLoaded = true;
    if (!storedUser) {
      browserAPI.tabs.update(tabId, { url: getIdentityPageUrl(targetUrl) });
    }
  });
  return true;
}

function enforceIdentityForTab(tabId, targetUrl) {
  if (!requiresIdentityEnforcement()) return;
  if (isIdentityIgnoredUrl(targetUrl)) return;
  browserAPI.tabs.update(tabId, { url: getIdentityPageUrl(targetUrl) });
}

function enforceIdentityAcrossTabs() {
  if (!requiresIdentityEnforcement()) return;
  const identityBase = getIdentityPageBase();
  browserAPI.tabs.query({}, (tabs) => {
    let hasIdentityTab = false;
    for (const tab of tabs || []) {
      const tabUrl = String((tab && tab.url) || '');
      if (tabUrl.startsWith(identityBase)) {
        hasIdentityTab = true;
        continue;
      }
      if (isIdentityIgnoredUrl(tabUrl)) continue;
      if (typeof tab.id === 'number') {
        browserAPI.tabs.update(tab.id, { url: getIdentityPageUrl(tabUrl) });
      }
    }
    if (!hasIdentityTab) {
      browserAPI.tabs.create({ url: identityBase });
    }
  });
}

async function loadSettingsFromServer() {
  try {
    const localData = await new Promise(resolve => {
      browserAPI.storage.local.get(['serverUrl'], resolve);
    });

    const resolvedUrl = normalizeServerUrl(localData.serverUrl) || normalizeServerUrl(serverUrl);
    if (!resolvedUrl) return;
    if (resolvedUrl !== serverUrl) {
      serverUrl = resolvedUrl;
      browserAPI.storage.local.set({ serverUrl: resolvedUrl });
    }

    const response = await fetch(`${serverUrl}/settings`);
    const settingsFromJson = await response.json();

    if (
      settingsFromJson &&
      Object.keys(settingsFromJson).length > 0 &&
      JSON.stringify(settingsFromJson) !== JSON.stringify(currentSettings)
    ) {
      adminPassword = settingsFromJson.adminPassword || adminPassword;
      restrictedPassword = String(settingsFromJson.restrictedPassword || '').trim();
      tempPassword = settingsFromJson.tempPassword || tempPassword;
      blockedKeywords = settingsFromJson.blockedKeywords || [];
      blockedSites = settingsFromJson.blockedSites || [];
      allowedLinks = settingsFromJson.allowedLinks || [];
      allowedDomains = settingsFromJson.allowedDomains || [];
      companyName = settingsFromJson.companyName || companyName;
      companyNotice = String(settingsFromJson.companyNotice || '').trim();
      quickLinks = Array.isArray(settingsFromJson.quickLinks) ? settingsFromJson.quickLinks : quickLinks;
      totalBlockMode = (settingsFromJson.totalBlockMode !== undefined)
        ? settingsFromJson.totalBlockMode
        : totalBlockMode;
      browserUser = settingsFromJson.browserUser || browserUser;
      tempAllowedLinks = Array.isArray(settingsFromJson.tempAllowedLinks)
        ? settingsFromJson.tempAllowedLinks
        : tempAllowedLinks;
      rebuildCompiledBlockingPatterns();
      const normalizedServerFromSettings = normalizeServerUrl(settingsFromJson.serverUrl);
      if (normalizedServerFromSettings && normalizedServerFromSettings !== serverUrl) {
        serverUrl = normalizedServerFromSettings;
        setupSSE();
      }
      
      currentSettings = settingsFromJson;
      
      browserAPI.storage.local.set({
        adminPassword,
        restrictedPassword,
        tempPassword,
        blockedKeywords,
        blockedSites,
        allowedLinks,
        allowedDomains,
        tempAllowedLinks,
        totalBlockMode,
        browserUser,
        companyName,
        companyNotice,
        quickLinks,
        serverUrl
      });
      
      chrome.runtime.sendMessage({ type: 'settingsUpdated', settings: currentSettings });
    }
  } catch (error) {
    console.error('Error loading settings from server:', error);
  }
}

// On startup: load all blocking settings from local storage FIRST so rules
// are active immediately when the browser opens, before the server responds.
function loadSettingsFromStorage() {
  browserAPI.storage.local.get([
    'adminPassword',
    'restrictedPassword',
    'tempPassword',
    'blockedKeywords',
    'blockedSites',
    'allowedLinks',
    'allowedDomains',
    'tempAllowedLinks',
    'totalBlockMode',
    'browserUser',
    'companyName',
    'companyNotice',
    'quickLinks',
    'serverUrl'
  ], (result) => {
    if (result.adminPassword) adminPassword = result.adminPassword;
    if (result.restrictedPassword !== undefined) restrictedPassword = String(result.restrictedPassword || '').trim();
    if (result.tempPassword) tempPassword = result.tempPassword;
    if (result.blockedKeywords) blockedKeywords = result.blockedKeywords;
    if (result.blockedSites) blockedSites = result.blockedSites;
    if (result.allowedLinks) allowedLinks = result.allowedLinks;
    if (result.allowedDomains) allowedDomains = result.allowedDomains;
    if (result.tempAllowedLinks) tempAllowedLinks = result.tempAllowedLinks;
    rebuildCompiledBlockingPatterns();
    if (result.totalBlockMode !== undefined) totalBlockMode = result.totalBlockMode;
    browserUser = String(result.browserUser || '').trim();
    if (result.companyName) companyName = result.companyName;
    if (result.companyNotice !== undefined) companyNotice = String(result.companyNotice || '').trim();
    if (Array.isArray(result.quickLinks)) quickLinks = result.quickLinks;
    if (result.serverUrl) serverUrl = normalizeServerUrl(result.serverUrl) || serverUrl;
    browserUserLoaded = true;
    enforceIdentityAcrossTabs();
  });
}

loadSettingsFromStorage();


function normalizeComparableUserName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getDayRangeMs(day) {
  const raw = String(day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { sinceMs: 0, untilMs: Date.now() + 1 };
  const sinceMs = new Date(`${raw}T00:00:00.000Z`).getTime();
  const untilMs = sinceMs + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(sinceMs)) return { sinceMs: 0, untilMs: Date.now() + 1 };
  return { sinceMs, untilMs };
}

async function sendPulledLogsToServer(payload) {
  const targetUser = String(payload && payload.targetUser || '').trim();
  const normalizedTarget = normalizeComparableUserName(targetUser);
  const normalizedLocal = normalizeComparableUserName(browserUser);
  if (!normalizedTarget || !normalizedLocal || normalizedTarget !== normalizedLocal) return;
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  if (!normalizedServerUrl) return;
  const { sinceMs, untilMs } = getDayRangeMs(payload.day);
  const selectedLogs = await readActivityLogs({
    action: 'all',
    sinceMs,
    untilMs,
    user: targetUser,
    limit: 20000
  });
  if (!selectedLogs.length) return;
  try {
    await fetch(`${normalizedServerUrl}/logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: payload.requestId, user: targetUser, day: payload.day, logs: selectedLogs })
    });
  } catch {}
}

function storageLocalGetAsync(keys) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function storageLocalSetAsync(payload) {
  return new Promise((resolve) => {
    browserAPI.storage.local.set(payload || {}, () => resolve());
  });
}

function storageLocalRemoveAsync(keys) {
  return new Promise((resolve) => {
    browserAPI.storage.local.remove(keys, () => resolve());
  });
}

function openLogsDb() {
  if (logsDbPromise) return logsDbPromise;
  if (typeof indexedDB === 'undefined') {
    logsDbPromise = Promise.resolve(null);
    return logsDbPromise;
  }
  logsDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(LOGS_DB_NAME, LOGS_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LOGS_STORE_NAME)) {
          const store = db.createObjectStore(LOGS_STORE_NAME, { keyPath: 'id' });
          store.createIndex('by_timestamp_ms', 'timestampMs', { unique: false });
          store.createIndex('by_action', 'action', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return logsDbPromise;
}

async function clearLegacyActivityLogsFromStorage() {
  await storageLocalRemoveAsync(['activityLogs']);
}

async function maybeCleanupActivityLogs(force = false) {
  const now = Date.now();
  if (!force && now - lastLogsCleanupAt < LOG_CLEANUP_INTERVAL_MS) return;
  lastLogsCleanupAt = now;
  const db = await openLogsDb();
  const cutoff = now - LOG_RETENTION_MS;
  if (!db) {
    const result = await storageLocalGetAsync(['activityLogs']);
    const logs = Array.isArray(result.activityLogs) ? result.activityLogs : [];
    const filtered = logs.filter((entry) => {
      const ms = Number(entry && entry.timestampMs) || new Date(entry && entry.timestamp).getTime() || 0;
      return ms >= cutoff;
    });
    await storageLocalSetAsync({ activityLogs: filtered });
    return;
  }
  await new Promise((resolve) => {
    const transaction = db.transaction(LOGS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOGS_STORE_NAME);
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      const value = cursor.value || {};
      const ms = Number(value.timestampMs) || new Date(value.timestamp).getTime() || 0;
      if (ms > 0 && ms < cutoff) {
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

async function appendActivityLog(log) {
  const db = await openLogsDb();
  if (!db) {
    const result = await storageLocalGetAsync(['activityLogs']);
    const logs = Array.isArray(result.activityLogs) ? result.activityLogs : [];
    logs.push(log);
    await storageLocalSetAsync({ activityLogs: logs.slice(-5000) });
    await maybeCleanupActivityLogs();
    return;
  }
  await new Promise((resolve) => {
    const transaction = db.transaction(LOGS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOGS_STORE_NAME);
    store.put(log);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  await maybeCleanupActivityLogs();
}

async function readActivityLogs({ action = 'all', sinceMs = 0, untilMs = Number.MAX_SAFE_INTEGER, user = '', limit = 5000 } = {}) {
  const normalizedAction = String(action || 'all').trim().toLowerCase();
  const normalizedLimit = Math.max(1, Math.min(20000, Number(limit) || 5000));
  const normalizedSince = Math.max(0, Number(sinceMs) || 0);
  const normalizedUntil = Math.max(normalizedSince, Number(untilMs) || Number.MAX_SAFE_INTEGER);
  const normalizedUser = normalizeComparableUserName(user);
  const db = await openLogsDb();
  if (!db) {
    const result = await storageLocalGetAsync(['activityLogs']);
    const logs = Array.isArray(result.activityLogs) ? result.activityLogs : [];
    return logs
      .filter((entry) => {
        if (!entry) return false;
        if (normalizedAction !== 'all' && String(entry.action || '').toLowerCase() !== normalizedAction) return false;
        if (normalizedUser) {
          const entryUser = normalizeComparableUserName(entry.browserUser || entry.windowsUser || entry.user || entry.user_id);
          if (entryUser !== normalizedUser) return false;
        }
        const ms = Number(entry.timestampMs) || new Date(entry.timestamp).getTime() || 0;
        return ms >= normalizedSince && ms < normalizedUntil;
      })
      .sort((a, b) => (Number(b.timestampMs) || 0) - (Number(a.timestampMs) || 0))
      .slice(0, normalizedLimit);
  }
  return new Promise((resolve) => {
    const transaction = db.transaction(LOGS_STORE_NAME, 'readonly');
    const store = transaction.objectStore(LOGS_STORE_NAME);
    let index = null;
    try {
      index = store.index('by_timestamp_ms');
    } catch {
      index = null;
    }
    if (!index) {
      const request = store.getAll();
      request.onsuccess = () => {
        const allLogs = Array.isArray(request.result) ? request.result : [];
        const filtered = allLogs
          .filter((entry) => {
            if (!entry) return false;
            if (normalizedAction !== 'all' && String(entry.action || '').toLowerCase() !== normalizedAction) return false;
            if (normalizedUser) {
              const entryUser = normalizeComparableUserName(entry.browserUser || entry.windowsUser || entry.user || entry.user_id);
              if (entryUser !== normalizedUser) return false;
            }
            const ms = Number(entry.timestampMs) || new Date(entry.timestamp).getTime() || 0;
            return ms >= normalizedSince && ms < normalizedUntil;
          })
          .sort((a, b) => (Number(b.timestampMs) || 0) - (Number(a.timestampMs) || 0))
          .slice(0, normalizedLimit);
        resolve(filtered);
      };
      request.onerror = () => resolve([]);
      return;
    }
    const collected = [];
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let keyRange = null;
    try {
      keyRange = IDBKeyRange.bound(normalizedSince, normalizedUntil - 1);
    } catch {
      keyRange = null;
    }
    const cursorRequest = index.openCursor(keyRange, 'prev');
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        settle(collected);
        return;
      }
      const entry = cursor.value;
      if (!entry) {
        cursor.continue();
        return;
      }
      const ms = Number(entry.timestampMs) || new Date(entry.timestamp).getTime() || 0;
      if (ms < normalizedSince) {
        settle(collected);
        return;
      }
      if (normalizedAction !== 'all' && String(entry.action || '').toLowerCase() !== normalizedAction) {
        cursor.continue();
        return;
      }
      if (normalizedUser) {
        const entryUser = normalizeComparableUserName(entry.browserUser || entry.windowsUser || entry.user || entry.user_id);
        if (entryUser !== normalizedUser) {
          cursor.continue();
          return;
        }
      }
      collected.push(entry);
      if (collected.length >= normalizedLimit) {
        settle(collected);
        return;
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => settle([]);
    transaction.onabort = () => settle([]);
    transaction.onerror = () => settle([]);
    transaction.oncomplete = () => settle(collected);
  });
}

async function clearAllActivityLogs() {
  const db = await openLogsDb();
  if (!db) {
    await storageLocalSetAsync({ activityLogs: [] });
    return;
  }
  await new Promise((resolve) => {
    const transaction = db.transaction(LOGS_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOGS_STORE_NAME);
    store.clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

void clearLegacyActivityLogsFromStorage();
void maybeCleanupActivityLogs(true);

let settingsEventSource = null;
let sseRetryTimer = null;

function setupSSE() {
  if (sseRetryTimer) {
    clearTimeout(sseRetryTimer);
    sseRetryTimer = null;
  }
  if (settingsEventSource) {
    try {
      settingsEventSource.close();
    } catch {}
  }
  settingsEventSource = null;
  if (!serverUrl || typeof EventSource !== 'function') return;
  try {
    const sseUrl = `${String(serverUrl).replace(/\/$/, '')}/settings/updates`;
    settingsEventSource = new EventSource(sseUrl);
    settingsEventSource.onmessage = async (event) => {
      let payload = {};
      try {
        payload = JSON.parse(String(event.data || '{}'));
      } catch {}
      if (!payload || !payload.updated) return;
      if (String(payload.kind || '').toLowerCase() === 'pull_logs') {
        await sendPulledLogsToServer(payload);
        return;
      }
      if (String(payload.kind || '').toLowerCase() === 'kanban' && String(payload.channel || '').toLowerCase() === 'kanban') {
        await storageLocalSetAsync({
          [KANBAN_REALTIME_DELTA_KEY]: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            payload
          }
        });
        return;
      }
      await loadSettingsFromServer();
    };
    settingsEventSource.onerror = () => {
      if (settingsEventSource) {
        try {
          settingsEventSource.close();
        } catch {}
      }
      settingsEventSource = null;
      if (sseRetryTimer) clearTimeout(sseRetryTimer);
      sseRetryTimer = setTimeout(() => {
        setupSSE();
      }, 3000);
    };
  } catch {
    if (sseRetryTimer) clearTimeout(sseRetryTimer);
    sseRetryTimer = setTimeout(() => {
      setupSSE();
    }, 3000);
  }
}

setupSSE();

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let shouldRebuildPatterns = false;
  if (changes.tempAllowedLinks) tempAllowedLinks = changes.tempAllowedLinks.newValue || [];
  if (changes.tempAllowedLinks) shouldRebuildPatterns = true;
  if (changes.allowedLinks) allowedLinks = changes.allowedLinks.newValue || [];
  if (changes.allowedDomains) allowedDomains = changes.allowedDomains.newValue || [];
  if (changes.allowedDomains) shouldRebuildPatterns = true;
  if (changes.blockedSites) blockedSites = changes.blockedSites.newValue || [];
  if (changes.blockedSites) shouldRebuildPatterns = true;
  if (shouldRebuildPatterns) rebuildCompiledBlockingPatterns();
  if (changes.blockedKeywords) blockedKeywords = changes.blockedKeywords.newValue || [];
  if (changes.totalBlockMode) totalBlockMode = !!changes.totalBlockMode.newValue;
  if (changes.restrictedPassword) restrictedPassword = String(changes.restrictedPassword.newValue || '').trim();
  if (changes.browserUser) {
    browserUser = changes.browserUser.newValue || '';
    enforceIdentityAcrossTabs();
  }
  if (changes.serverUrl) {
    serverUrl = normalizeServerUrl(changes.serverUrl.newValue) || serverUrl;
    setupSSE();
  }
});

if (browserAPI.alarms && browserAPI.alarms.onAlarm) {
  browserAPI.alarms.clearAll();
}

browserAPI.runtime.onStartup.addListener(() => {
  if (!browserUserLoaded) loadSettingsFromStorage();
  loadSettingsFromServer();
  setupSSE();
  enforceIdentityAcrossTabs();
});

browserAPI.runtime.onInstalled.addListener(() => {
  if (!browserUserLoaded) loadSettingsFromStorage();
  loadSettingsFromServer();
  setupSSE();
  enforceIdentityAcrossTabs();
});

// Log user activity
async function logActivity(action, details) {
  const windowsUsername = await getWindowsUsername();
  const timestamp = new Date();
  const normalizedBrowserUser = String(browserUser || '').trim();
  const normalizedWindowsUser = String(windowsUsername || '').trim();
  const resolvedWindowsUser = (normalizedWindowsUser && normalizedWindowsUser !== 'unknown-user')
    ? normalizedWindowsUser
    : (normalizedBrowserUser || normalizedWindowsUser);
  const log = {
    id: `${timestamp.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
    windowsUser: resolvedWindowsUser,
    browserUser: browserUser,
    timestamp: timestamp.toISOString(),
    timestampMs: timestamp.getTime(),
    browser: getCurrentBrowserName(),
    action,
    details
  };
  await appendActivityLog(log);

  // Send to server
  return log;
}

// Get Windows username
async function getWindowsUsername() {
  if (hasResolvedWindowsUser) {
    return cachedWindowsUser || 'unknown-user';
  }
  if (!windowsUserResolvePromise) {
    windowsUserResolvePromise = (async () => {
      const nativeResult = await getNativeWindowsUser();
      if (nativeResult && nativeResult.ok) {
        const displayName = String(nativeResult.displayName || '').trim();
        const userName = String(nativeResult.userName || '').trim();
        cachedWindowsUser = displayName || userName || 'unknown-user';
      } else {
        cachedWindowsUser = 'unknown-user';
      }
      hasResolvedWindowsUser = true;
      windowsUserResolvePromise = null;
      return cachedWindowsUser;
    })();
  }
  return windowsUserResolvePromise;
}

function getHost(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {}
  const cleaned = raw.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0].trim();
  return cleaned.startsWith('www.') ? cleaned.slice(4) : cleaned;
}

function matchesComCountryVariant(host, base) {
  if (!base.endsWith('.com')) return false;
  if (!host.startsWith(`${base}.`)) return false;
  const suffix = host.slice(base.length + 1);
  return /^[a-z]{2,}(\.[a-z]{2,})*$/.test(suffix);
}

function singleDomainMatches(urlOrDomain, pattern) {
  const host = getHost(urlOrDomain);
  const p = getHost(pattern);
  if (!host || !p) return false;
  const base = p.startsWith('*.') ? p.slice(2) : p;
  if (host === base || host.endsWith(`.${base}`)) return true;
  return matchesComCountryVariant(host, base);
}

function domainMatchesPattern(urlOrDomain, patterns) {
  const host = getHost(urlOrDomain);
  const patternList = String(patterns || '').split(';').map(p => p.trim()).filter(Boolean);
  if (!host || !patternList.length) return false;
  return patternList.some((pattern) => {
    const p = getHost(pattern);
    if (!p) return false;
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(host)) return true;
    const base = p.startsWith('*.') ? p.slice(2) : p;
    return matchesComCountryVariant(host, base);
  });
}

function normalizePatternEntry(value) {
  return String(value || '').toLowerCase().trim();
}

function compilePatternMatcherEntry(pattern) {
  const hostPattern = getHost(pattern);
  if (!hostPattern) return null;
  const escaped = hostPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return {
    regex: new RegExp(`^${escaped}$`, 'i'),
    base: hostPattern.startsWith('*.') ? hostPattern.slice(2) : hostPattern
  };
}

function buildCompiledPatternList(sourceList) {
  if (!Array.isArray(sourceList) || sourceList.length === 0) return EMPTY_COMPILED_PATTERNS;
  const rawEntries = [];
  const domainMatchers = [];
  for (const value of sourceList) {
    const normalized = normalizePatternEntry(value);
    if (!normalized) continue;
    rawEntries.push(normalized);
    const parts = normalized.split(';').map((item) => item.trim()).filter(Boolean);
    for (const part of parts) {
      const matcher = compilePatternMatcherEntry(part);
      if (matcher) domainMatchers.push(matcher);
    }
  }
  if (!rawEntries.length && !domainMatchers.length) return EMPTY_COMPILED_PATTERNS;
  return { rawEntries, domainMatchers };
}

function rebuildCompiledBlockingPatterns() {
  blockedSitesCompiled = buildCompiledPatternList(blockedSites);
  allowedDomainsCompiled = buildCompiledPatternList(allowedDomains);
  tempAllowedLinksCompiled = buildCompiledPatternList(tempAllowedLinks);
}

function matchesCompiledDomainPatterns(urlOrDomain, compiledSet) {
  const host = getHost(urlOrDomain);
  if (!host || !compiledSet || !compiledSet.domainMatchers || !compiledSet.domainMatchers.length) return false;
  return compiledSet.domainMatchers.some(({ regex, base }) => {
    if (regex.test(host)) return true;
    return matchesComCountryVariant(host, base);
  });
}

function getBrasiliaHour() {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const hourPart = parts.find((part) => part.type === 'hour');
    const hour = Number(hourPart && hourPart.value);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

function getBrasiliaHourCached() {
  const now = Date.now();
  if (cachedBrasiliaHour !== null && now < cachedBrasiliaExpiresAt) {
    return cachedBrasiliaHour;
  }
  const hour = getBrasiliaHour();
  cachedBrasiliaHour = hour;
  cachedBrasiliaExpiresAt = now + BRASILIA_HOUR_CACHE_MS;
  return hour;
}

function isBrasiliaFreeWindow() {
  const hour = typeof getBrasiliaHourCached === 'function' ? getBrasiliaHourCached() : getBrasiliaHour();
  return hour === 12;
}

function buildNavigationCheckKey(tabId, url) {
  return `${tabId}|${String(url || '').trim().toLowerCase()}`;
}

function pruneRecentNavigationChecks(now) {
  if (recentNavigationChecks.size <= NAVIGATION_DEDUPE_MAX_ENTRIES) return;
  for (const [key, timestamp] of recentNavigationChecks) {
    if (now - timestamp > NAVIGATION_DEDUPE_WINDOW_MS) {
      recentNavigationChecks.delete(key);
    }
    if (recentNavigationChecks.size <= NAVIGATION_DEDUPE_MAX_ENTRIES) return;
  }
  if (recentNavigationChecks.size <= NAVIGATION_DEDUPE_MAX_ENTRIES) return;
  const overflowCount = recentNavigationChecks.size - NAVIGATION_DEDUPE_MAX_ENTRIES;
  let removed = 0;
  for (const key of recentNavigationChecks.keys()) {
    recentNavigationChecks.delete(key);
    removed += 1;
    if (removed >= overflowCount) break;
  }
}

function shouldSkipNavigationBlocking(tabId, url) {
  if (typeof tabId !== 'number' || tabId < 0) return false;
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return false;
  const now = Date.now();
  const key = buildNavigationCheckKey(tabId, normalizedUrl);
  const previousTimestamp = recentNavigationChecks.get(key);
  recentNavigationChecks.set(key, now);
  pruneRecentNavigationChecks(now);
  return typeof previousTimestamp === 'number' && (now - previousTimestamp) <= NAVIGATION_DEDUPE_WINDOW_MS;
}

function processNavigationBlocking(tabId, url) {
  if (shouldSkipNavigationBlocking(tabId, url)) return;
  if (!shouldBlockUrl(url)) return;
  const blockedPageBase = browserAPI.runtime.getURL('blocked.html');
  logActivity('blocked', {
    url
  });
  const blockedPageUrl = blockedPageBase + '?url=' + encodeURIComponent(url);
  browserAPI.tabs.update(tabId, { url: blockedPageUrl });
}

// Check if URL should be blocked
function shouldBlockUrl(url) {
  if (isExtensionPage(url)) return false;
  if (isExemptBrowserUser()) return false;
  if (isBrasiliaFreeWindow()) return false;
  const urlLower = url.toLowerCase();

  // Check temporary access
  if (temporaryAllowed.has(urlLower)) {
    const expiryTime = temporaryAllowed.get(urlLower);
    if (Date.now() < expiryTime) return false;
    else temporaryAllowed.delete(urlLower);
  }

  // Check if URL is in allowedLinks
  if (allowedLinks.some(link => urlLower.includes(link.toLowerCase()))) return false;

  // Priority: blockedSites must override allowedDomains/tempAllowedLinks
  for (const p of blockedSitesCompiled.rawEntries) {
    if (!p) continue;
    if (urlLower.includes(p)) return true;
    if (singleDomainMatches(urlLower, p)) return true;
  }
  if (matchesCompiledDomainPatterns(urlLower, blockedSitesCompiled)) return true;

  // Check if URL matches allowedDomains patterns (permanent)
  for (const domainPattern of allowedDomainsCompiled.rawEntries) {
    if (singleDomainMatches(urlLower, domainPattern)) return false;
  }
  if (matchesCompiledDomainPatterns(urlLower, allowedDomainsCompiled)) return false;

  // Check if URL matches tempAllowedLinks (temporary, pending admin approval)
  for (const p of tempAllowedLinksCompiled.rawEntries) {
    if (!p) continue;
    if (urlLower.includes(p)) return false;
    if (singleDomainMatches(urlLower, p)) return false;
  }
  if (matchesCompiledDomainPatterns(urlLower, tempAllowedLinksCompiled)) return false;

  // If totalBlockMode is enabled, block everything not allowed
  if (totalBlockMode) return true;

  // Check for blocked keywords
  return blockedKeywords.some(keyword => urlLower.includes(keyword.toLowerCase()));
}

let temporaryAllowed = new Map();

function normalizeArray(v) {
  return Array.isArray(v) ? v : [];
}

function applySettingsFromDashboard(settings) {
  adminPassword = settings.adminPassword || adminPassword;
  restrictedPassword = String(settings.restrictedPassword || '').trim();
  tempPassword = settings.tempPassword || tempPassword;
  blockedKeywords = normalizeArray(settings.blockedKeywords);
  blockedSites = normalizeArray(settings.blockedSites);
  allowedLinks = normalizeArray(settings.allowedLinks);
  allowedDomains = normalizeArray(settings.allowedDomains);
  tempAllowedLinks = normalizeArray(settings.tempAllowedLinks);
  rebuildCompiledBlockingPatterns();
  totalBlockMode = !!settings.totalBlockMode;
  browserUser = settings.browserUser || browserUser;
  companyName = settings.companyName || companyName;
  companyNotice = String(settings.companyNotice || '').trim();
  quickLinks = normalizeArray(settings.quickLinks);
  const normalizedServerFromSettings = normalizeServerUrl(settings.serverUrl);
  if (normalizedServerFromSettings && normalizedServerFromSettings !== serverUrl) {
    serverUrl = normalizedServerFromSettings;
    setupSSE();
  }
  browserAPI.storage.local.set({
    adminPassword,
    restrictedPassword,
    tempPassword,
    blockedKeywords,
    blockedSites,
    allowedLinks,
    allowedDomains,
    tempAllowedLinks,
    totalBlockMode,
    browserUser,
    companyName,
    companyNotice,
    quickLinks,
    serverUrl
  });
}

function resolveAccessRole(password) {
  const candidate = String(password || '');
  if (candidate === adminPassword) return 'admin';
  if (restrictedPassword && candidate === restrictedPassword) return 'restricted';
  return '';
}

function sendNativeMessageAsync(hostName, payload) {
  return new Promise((resolve) => {
    if (!browserAPI.runtime || typeof browserAPI.runtime.sendNativeMessage !== 'function') {
      resolve({ ok: false, code: 'NATIVE_MESSAGING_UNAVAILABLE', message: 'native-messaging-indisponivel' });
      return;
    }
    try {
      browserAPI.runtime.sendNativeMessage(hostName, payload, (response) => {
        if (browserAPI.runtime.lastError) {
          resolve({
            ok: false,
            code: 'NATIVE_HOST_ERROR',
            message: String(browserAPI.runtime.lastError.message || 'native-host-indisponivel')
          });
          return;
        }
        if (!response || typeof response !== 'object') {
          resolve({ ok: false, code: 'INVALID_NATIVE_RESPONSE', message: 'resposta-invalida' });
          return;
        }
        resolve(response);
      });
    } catch (error) {
      resolve({
        ok: false,
        code: 'NATIVE_HOST_EXCEPTION',
        message: String(error && error.message ? error.message : 'falha-no-native-host')
      });
    }
  });
}

async function pickNativeFileAttachment(request) {
  const allowedExtensions = Array.isArray(request && request.allowedExtensions)
    ? request.allowedExtensions
    : [];
  const payload = {
    action: 'pickFile',
    allowedExtensions,
    preferUnc: true
  };
  return sendNativeMessageAsync(nativeFilePickerHostName, payload);
}

async function openNativeFileAttachment(request) {
  const allowedExtensions = Array.isArray(request && request.allowedExtensions)
    ? request.allowedExtensions
    : [];
  const fileUrl = String((request && request.fileUrl) || '').trim();
  if (!/^file:/i.test(fileUrl)) {
    return { ok: false, code: 'INVALID_FILE_URL', message: 'url-de-arquivo-invalida' };
  }
  const payload = {
    action: 'openFile',
    fileUrl,
    allowedExtensions
  };
  return sendNativeMessageAsync(nativeFilePickerHostName, payload);
}

async function getNativeWindowsUser() {
  const payload = { action: 'getWindowsUser' };
  const result = await sendNativeMessageAsync(nativeFilePickerHostName, payload);
  if (!result || !result.ok) {
    return result;
  }
  const userName = String((result.userName || result.username || '')).trim();
  const userDomain = String((result.userDomain || result.domain || '')).trim();
  const displayNameRaw = String(result.displayName || '').trim();
  const displayName = displayNameRaw || (userDomain && userName ? `${userDomain}\\${userName}` : userName);
  if (!userName && !displayName) {
    return { ok: false, code: 'WINDOWS_USER_EMPTY', message: 'windows-user-vazio' };
  }
  return {
    ok: true,
    userName: userName || displayName,
    userDomain,
    displayName: displayName || userName
  };
}

function isRequestAuthorized(request, allowedRoles = ['admin']) {
  const role = resolveAccessRole(request && request.password);
  return allowedRoles.includes(role);
}

// Message listener
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'verifyPassword':
      {
        const role = resolveAccessRole(request.password);
        sendResponse({ isValid: !!role, role: role || null });
      }
      break;

    case 'verifyTempPassword':
      if (request.password === tempPassword) {
        const url = request.url.toLowerCase();
        temporaryAllowed.set(url, Date.now() + 2 * 60 * 1000);
        browserAPI.tabs.update({ url });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'updateTempPassword':
      if (request.adminPassword === adminPassword) {
        tempPassword = request.newPassword;
        browserAPI.storage.local.set({ tempPassword });
        sendResponse({ success: true });
      }
      break;

    case 'updateAdminPassword':
      if (request.currentPassword === adminPassword) {
        adminPassword = request.newPassword;
        browserAPI.storage.local.set({ adminPassword });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'updateServerUrl':
      if (isRequestAuthorized(request, ['admin'])) {
        const normalized = normalizeServerUrl(request.serverUrl);
        if (!normalized) {
          sendResponse({ success: false });
          break;
        }
        serverUrl = normalized;
        browserAPI.storage.local.set({ serverUrl });
        setupSSE();
        sendResponse({ success: true, serverUrl });
      }
      break;

    case 'updateBlockedSites':
      if (isRequestAuthorized(request, ['admin', 'restricted'])) {
        blockedSites = request.sites;
        rebuildCompiledBlockingPatterns();
        browserAPI.storage.local.set({ blockedSites });
        sendResponse({ success: true });
      }
      break;

    case 'updateBlockedKeywords':
      if (isRequestAuthorized(request, ['admin'])) {
        blockedKeywords = request.keywords;
        browserAPI.storage.local.set({ blockedKeywords });
        sendResponse({ success: true });
      }
      break;

    case 'updateAllowedLinks':
      if (isRequestAuthorized(request, ['admin'])) {
        allowedLinks = request.links;
        browserAPI.storage.local.set({ allowedLinks });
        sendResponse({ success: true });
      }
      break;

    case 'updateAllowedDomains':
      if (isRequestAuthorized(request, ['admin', 'restricted'])) {
        allowedDomains = request.domains;
        rebuildCompiledBlockingPatterns();
        browserAPI.storage.local.set({ allowedDomains });
        sendResponse({ success: true });
      }
      break;

    case 'updateTempAllowedLinks':
      if (isRequestAuthorized(request, ['admin', 'restricted'])) {
        tempAllowedLinks = request.links;
        rebuildCompiledBlockingPatterns();
        browserAPI.storage.local.set({ tempAllowedLinks });
        sendResponse({ success: true });
      }
      break;

    case 'updateTotalBlockMode':
      if (isRequestAuthorized(request, ['admin'])) {
        totalBlockMode = request.enabled;
        browserAPI.storage.local.set({ totalBlockMode });
        sendResponse({ success: true });
      }
      break;

    case 'updateBrowserUser':
      if (isRequestAuthorized(request, ['admin'])) {
        browserUser = request.username;
        browserAPI.storage.local.set({ browserUser });
        sendResponse({ success: true });
      }
      break;

    case 'authorizeDisable':
      if (isRequestAuthorized(request, ['admin'])) {
        browserAPI.storage.local.set({ isAuthorizedDisable: true }, () => {
          setTimeout(() => {
            browserAPI.storage.local.set({ isAuthorizedDisable: false });
          }, 5000);
        });
        sendResponse({ success: true });
      }
      break;

    case 'getLogs':
      if (isRequestAuthorized(request, ['admin'])) {
        readActivityLogs({
          action: request.filter || 'all',
          sinceMs: Number(request.sinceMs) || 0,
          limit: Number(request.limit) || 5000
        }).then((logs) => {
          sendResponse({ logs });
        }).catch(() => {
          sendResponse({ logs: [] });
        });
        return true;
      }
      break;

    case 'getActivityLogs':
      readActivityLogs({
        action: request.filter || 'all',
        sinceMs: Number(request.sinceMs) || 0,
        limit: Number(request.limit) || 5000
      }).then((logs) => {
        sendResponse({ logs });
      }).catch(() => {
        sendResponse({ logs: [] });
      });
      return true;

    case 'clearActivityLogs':
      clearAllActivityLogs().then(() => {
        sendResponse({ success: true });
      }).catch(() => {
        sendResponse({ success: false });
      });
      return true;

    case 'backupSettings':
      if (isRequestAuthorized(request, ['admin'])) {
        const settings = {
          adminPassword,
          restrictedPassword,
          tempPassword,
          companyName,
          serverUrl,
          quickLinks,
          blockedKeywords,
          blockedSites,
          allowedLinks,
          allowedDomains,
          tempAllowedLinks,
          totalBlockMode,
          browserUser,
          companyNotice
        };
        sendResponse({ settings });
      }
      break;

    case 'restoreSettings':
      if (isRequestAuthorized(request, ['admin'])) {
        const settings = request.settings;
        adminPassword = settings.adminPassword || adminPassword;
        restrictedPassword = String(settings.restrictedPassword || '').trim();
        tempPassword = settings.tempPassword || tempPassword;
        companyName = settings.companyName || companyName;
        quickLinks = Array.isArray(settings.quickLinks) ? settings.quickLinks : quickLinks;
        blockedKeywords = settings.blockedKeywords || [];
        blockedSites = settings.blockedSites || [];
        allowedLinks = settings.allowedLinks || [];
        allowedDomains = settings.allowedDomains || [];
        tempAllowedLinks = settings.tempAllowedLinks || [];
        rebuildCompiledBlockingPatterns();
        totalBlockMode = !!settings.totalBlockMode;
        browserUser = settings.browserUser || '';
        companyNotice = String(settings.companyNotice || '').trim();
        const normalizedRestoredServerUrl = normalizeServerUrl(settings.serverUrl);
        if (normalizedRestoredServerUrl) serverUrl = normalizedRestoredServerUrl;
        
        browserAPI.storage.local.set({
          adminPassword,
          restrictedPassword,
          tempPassword,
          companyName,
          serverUrl,
          quickLinks,
          blockedKeywords,
          blockedSites,
          allowedLinks,
          allowedDomains,
          tempAllowedLinks,
          totalBlockMode,
          browserUser,
          companyNotice
        }, () => {
          setupSSE();
          sendResponse({ success: true });
        });
        return true;
      }
      break;

    case 'newReleaseRequest':
      console.log('New release request received:', request.request);
      try {
        const normalizedServerUrl = normalizeServerUrl(serverUrl);
        const releasePayload = {
          ...(request.request || {}),
          clientRequestId: String((request.request && request.request.clientRequestId) || '').trim(),
          browser: String((request.request && request.request.browser) || getCurrentBrowserName()).trim() || 'Desconhecido',
          browserUser: String((request.request && (request.request.browserUser || request.request.user)) || browserUser || '').trim()
        };
        if (normalizedServerUrl) {
          fetch(`${normalizedServerUrl}/api/request-release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(releasePayload)
          }).catch((error) => console.error('Failed to send release request to server:', error));
        }
      } catch (error) {
        console.error('Error preparing release request payload:', error);
      }
      sendResponse({ success: true });
      break;

    case 'pickNativeFileAttachment':
      pickNativeFileAttachment(request)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({
          ok: false,
          code: 'NATIVE_PICK_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-selecionar-arquivo')
        }));
      return true;

    case 'openNativeFileAttachment':
      openNativeFileAttachment(request)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({
          ok: false,
          code: 'NATIVE_OPEN_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-abrir-arquivo')
        }));
      return true;

    case 'getWindowsUser':
      getNativeWindowsUser()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({
          ok: false,
          code: 'WINDOWS_USER_ERROR',
          message: String(error && error.message ? error.message : 'falha-ao-obter-usuario-windows')
        }));
      return true;
  }
});

// Tab update listener - block URLs
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const identityPageBase = getIdentityPageBase();
    if (changeInfo.url.startsWith(identityPageBase)) return;
    if (enforceIdentityWithStorageFallback(tabId, changeInfo.url)) return;

    logActivity('navigation', {
      url: changeInfo.url,
      title: tab.title
    });

    processNavigationBlocking(tabId, changeInfo.url);
  }
});

// Download listener
browserAPI.downloads.onCreated.addListener((downloadItem) => {
  logActivity('download', {
    filename: downloadItem.filename,
    url: downloadItem.url,
    fileSize: downloadItem.fileSize
  });
});

// Web navigation listener for better URL tracking
browserAPI.webNavigation.onBeforeNavigate.addListener((details) => {
  const identityPageBase = getIdentityPageBase();
  if (details.url.startsWith(identityPageBase)) return;

  if (details.frameId === 0 && enforceIdentityWithStorageFallback(details.tabId, details.url)) return;
  if (details.frameId !== 0) return;
  processNavigationBlocking(details.tabId, details.url);
});
