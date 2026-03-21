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
let browserUserLoaded = false;

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
      const normalizedServerFromSettings = normalizeServerUrl(settingsFromJson.serverUrl);
      if (normalizedServerFromSettings && normalizedServerFromSettings !== serverUrl) {
        serverUrl = normalizedServerFromSettings;
        setupSSE();
        connectWs();
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

let settingsEventSource = null;
let wsClient = null;
let wsRetryTimer = null;
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

function toWsUrl(url) {
  try {
    const u = new URL(url);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function wsSend(payload) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(payload));
  }
}

async function connectWs() {
  if (wsRetryTimer) clearTimeout(wsRetryTimer);
  const wsUrl = toWsUrl(serverUrl);
  if (!wsUrl) return;
  try { if (wsClient) wsClient.close(); } catch {}
  try {
    wsClient = new WebSocket(wsUrl);
    wsClient.onopen = async () => {
      const windowsUser = await getWindowsUsername();
      wsSend({ type: 'identify', role: 'extension', browserUser, windowsUser });
    };
    wsClient.onmessage = (event) => handleWsMessage(event.data);
    
    wsClient.onerror = () => {
      try { wsClient.close(); } catch {}
    };
  } catch {
    consolo.log('LostConnect')// wsRetryTimer = setTimeout(connectWs, 5000);
  }
}

setupSSE();
connectWs();

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.tempAllowedLinks) tempAllowedLinks = changes.tempAllowedLinks.newValue || [];
  if (changes.allowedLinks) allowedLinks = changes.allowedLinks.newValue || [];
  if (changes.allowedDomains) allowedDomains = changes.allowedDomains.newValue || [];
  if (changes.blockedSites) blockedSites = changes.blockedSites.newValue || [];
  if (changes.blockedKeywords) blockedKeywords = changes.blockedKeywords.newValue || [];
  if (changes.totalBlockMode) totalBlockMode = !!changes.totalBlockMode.newValue;
  if (changes.restrictedPassword) restrictedPassword = String(changes.restrictedPassword.newValue || '').trim();
  if (changes.browserUser) {
    browserUser = changes.browserUser.newValue || '';
    wsSend({ type: 'identify', role: 'extension', browserUser });
    enforceIdentityAcrossTabs();
  }
  if (changes.serverUrl) {
    serverUrl = normalizeServerUrl(changes.serverUrl.newValue) || serverUrl;
    setupSSE();
    connectWs();
  }
});

if (browserAPI.alarms && browserAPI.alarms.onAlarm) {
  browserAPI.alarms.clearAll();
}

browserAPI.runtime.onStartup.addListener(() => {
  if (!browserUserLoaded) loadSettingsFromStorage();
  loadSettingsFromServer();
  setupSSE();
  connectWs();
  enforceIdentityAcrossTabs();
});

browserAPI.runtime.onInstalled.addListener(() => {
  if (!browserUserLoaded) loadSettingsFromStorage();
  loadSettingsFromServer();
  setupSSE();
  connectWs();
  enforceIdentityAcrossTabs();
});

// Log user activity
async function logActivity(action, details) {
  const windowsUsername = await getWindowsUsername();
  const timestamp = new Date();
  const log = {
    windowsUser: windowsUsername,
    browserUser: browserUser,
    timestamp: timestamp.toISOString(),
    browser: getCurrentBrowserName(),
    action,
    details
  };

  // Store locally (last week)
  browserAPI.storage.local.get(['activityLogs'], (result) => {
    let logs = result.activityLogs || [];
    logs = logs.filter(log => new Date(log.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    logs.push(log);
    browserAPI.storage.local.set({ activityLogs: logs });
  });

  // Send to server
  return log;
}

// Get Windows username
async function getWindowsUsername() {
  try {
    if (browserAPI.system && browserAPI.system.display) {
      const info = await browserAPI.system.display.getInfo();
      return info[0]?.name || 'unknown-user';
    }
    return 'unknown-user';
  } catch (error) {
    return 'unknown-user';
  }
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

function isBrasiliaFreeWindow() {
  const hour = getBrasiliaHour();
  return hour === 12;
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
  for (const pattern of blockedSites) {
    const p = (pattern || '').toLowerCase().trim();
    if (!p) continue;
    if (urlLower.includes(p)) return true;
    if (singleDomainMatches(urlLower, p)) return true;
    if (domainMatchesPattern(urlLower, p)) return true;
  }

  // Check if URL matches allowedDomains patterns (permanent)
  for (const domainPattern of allowedDomains) {
    if (singleDomainMatches(urlLower, domainPattern)) return false;
    if (domainMatchesPattern(urlLower, domainPattern)) return false;
  }

  // Check if URL matches tempAllowedLinks (temporary, pending admin approval)
  for (const pattern of tempAllowedLinks) {
    const p = (pattern || '').toLowerCase().trim();
    if (!p) continue;
    if (urlLower.includes(p)) return false;
    if (singleDomainMatches(urlLower, p)) return false;
    if (domainMatchesPattern(urlLower, p)) return false;
  }

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
  totalBlockMode = !!settings.totalBlockMode;
  browserUser = settings.browserUser || browserUser;
  companyName = settings.companyName || companyName;
  companyNotice = String(settings.companyNotice || '').trim();
  quickLinks = normalizeArray(settings.quickLinks);
  const normalizedServerFromSettings = normalizeServerUrl(settings.serverUrl);
  if (normalizedServerFromSettings && normalizedServerFromSettings !== serverUrl) {
    serverUrl = normalizedServerFromSettings;
    setupSSE();
    connectWs();
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

function decideReleaseRequest(decision, req) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['releaseRequests', 'allowedDomains', 'blockedSites', 'tempAllowedLinks'], (result) => {
      const requests = result.releaseRequests || [];
      const allowedDomainsLocal = result.allowedDomains || [];
      const blockedSitesLocal = result.blockedSites || [];
      let tempAllowedLinksLocal = result.tempAllowedLinks || [];
      const idx = requests.findIndex(r =>
        (req.timestamp && r.timestamp === req.timestamp) ||
        ((r.domain || '') === (req.domain || '') && (r.reason || '') === (req.reason || ''))
      );
      if (idx < 0) return resolve({ success: false, message: 'request-not-found' });
      const domain = requests[idx].domain;
      tempAllowedLinksLocal = tempAllowedLinksLocal.filter(d => d !== domain);
      if (decision === 'approve') {
        if (!allowedDomainsLocal.includes(domain)) allowedDomainsLocal.push(domain);
      } else {
        if (!blockedSitesLocal.includes(domain)) blockedSitesLocal.push(domain);
      }
      requests.splice(idx, 1);
      browserAPI.storage.local.set({
        releaseRequests: requests,
        allowedDomains: allowedDomainsLocal,
        blockedSites: blockedSitesLocal,
        tempAllowedLinks: tempAllowedLinksLocal
      }, () => resolve({ success: true, decision, domain }));
    });
  });
}

async function handleWsMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  if (msg.type === 'applySettings' && msg.settings) {
    applySettingsFromDashboard(msg.settings);
    return;
  }

  if (msg.type === 'stateUpdate') {
    if (msg.settings) applySettingsFromDashboard(msg.settings);
    if (Array.isArray(msg.releaseRequests)) {
      browserAPI.storage.local.set({ releaseRequests: msg.releaseRequests });
    }
    return;
  }

  if (msg.type !== 'command') return;

  let data = { ok: true };
  if (msg.action === 'applySettings' && msg.payload?.settings) {
    applySettingsFromDashboard(msg.payload.settings);
    data = { success: true };
  } else if (msg.action === 'getUserInfo') {
    data = { browserUser, windowsUser: await getWindowsUsername() };
  } else if (msg.action === 'getLogs') {
    data = await new Promise((resolve) => {
      browserAPI.storage.local.get(['activityLogs'], (result) => resolve({ logs: result.activityLogs || [] }));
    });
  } else if (msg.action === 'pullLogs') {
    data = await new Promise((resolve) => {
      browserAPI.storage.local.get(['activityLogs'], (result) => {
        const logs = Array.isArray(result.activityLogs) ? result.activityLogs : [];
        browserAPI.storage.local.set({ activityLogs: [] }, () => {
          resolve({ logs });
        });
      });
    });
  } else if (msg.action === 'getRastreio') {
    data = await new Promise((resolve) => {
      browserAPI.storage.local.get(['activityLogs'], (result) => {
        const logs = (result.activityLogs || []).filter(l => l.action === 'navigation');
        const cutoff = Date.now() - 72 * 60 * 60 * 1000;
        resolve({ rastreio: logs.filter(l => new Date(l.timestamp).getTime() > cutoff) });
      });
    });
  } else if (msg.action === 'getReleaseRequests') {
    data = await new Promise((resolve) => {
      browserAPI.storage.local.get(['releaseRequests'], (result) => resolve({ requests: result.releaseRequests || [] }));
    });
  } else if (msg.action === 'decideRequest') {
    data = await decideReleaseRequest(msg.payload?.decision, msg.payload?.request || {});
  }

  wsSend({ type: 'response', requestId: msg.requestId, data });
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
        connectWs();
        sendResponse({ success: true, serverUrl });
      }
      break;

    case 'updateBlockedSites':
      if (isRequestAuthorized(request, ['admin', 'restricted'])) {
        blockedSites = request.sites;
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
        browserAPI.storage.local.set({ allowedDomains });
        sendResponse({ success: true });
      }
      break;

    case 'updateTempAllowedLinks':
      if (isRequestAuthorized(request, ['admin', 'restricted'])) {
        tempAllowedLinks = request.links;
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
        browserAPI.storage.local.get(['activityLogs'], (result) => {
          sendResponse({ logs: result.activityLogs || [] });
        });
        return true;
      }
      break;

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
          connectWs();
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
  }
});

// Tab update listener - block URLs
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const blockedPageBase = browserAPI.runtime.getURL('blocked.html');
    const identityPageBase = getIdentityPageBase();
    if (changeInfo.url.startsWith(identityPageBase)) return;
    if (enforceIdentityWithStorageFallback(tabId, changeInfo.url)) return;

    logActivity('navigation', {
      url: changeInfo.url,
      title: tab.title
    });
    
    if (shouldBlockUrl(changeInfo.url)) {
      logActivity('blocked', {
        url: changeInfo.url
      });
      const blockedPageUrl = blockedPageBase + '?url=' + encodeURIComponent(changeInfo.url);
      browserAPI.tabs.update(tabId, { url: blockedPageUrl });
    }
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
  const blockedPageBase = browserAPI.runtime.getURL('blocked.html');
  const identityPageBase = getIdentityPageBase();
  if (details.url.startsWith(identityPageBase)) return;

  if (details.frameId === 0 && enforceIdentityWithStorageFallback(details.tabId, details.url)) return;

  if (details.frameId === 0 && shouldBlockUrl(details.url)) {
    logActivity('blocked', {
      url: details.url
    });
    const blockedPageUrl = blockedPageBase + '?url=' + encodeURIComponent(details.url);
    browserAPI.tabs.update(details.tabId, { url: blockedPageUrl });
  }
});
