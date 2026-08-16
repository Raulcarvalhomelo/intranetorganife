// Browser compatibility layer
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

function sendRuntimeMessage(message, callback) {
  let settled = false;
  const finish = (response) => {
    if (settled) return;
    settled = true;
    if (typeof callback === 'function') callback(response);
  };
  try {
    const onCallback = (response) => {
      if (browserAPI.runtime.lastError) {
        finish(undefined);
        return;
      }
      finish(response);
    };
    const result = browserAPI.runtime.sendMessage(message, onCallback);
    if (result && typeof result.then === 'function') result.then(finish).catch(() => finish(undefined));
  } catch (error) {
    finish(undefined);
  }
}

let isAdmin = false;
let currentAdminPassword = '';
let currentAccessRole = '';
const restrictedTabs = ['logs', 'solicitacoes', 'usuarios', 'avisos'];

// Default quick links
const defaultQuickLinks = [
  { name: 'Intranet', url: 'https://intranet.empresa.com' },
  { name: 'Email', url: 'https://mail.empresa.com' },
  { name: 'Suporte TI', url: 'https://suporte.empresa.com' }
];
const THEME_STORAGE_KEY = 'themeMode';

function sanitizePlainText(value, maxLength = 500) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') // Remove control chars except newline (\n = 0x0A)
    .trim();
  if (!text) return '';
  return text.slice(0, maxLength);
}

function sanitizeNoticeText(value) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') // Remove control chars except newline (\n = 0x0A)
    .trim();
  return text;
}

function normalizeThemeMode(value) {
  return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

function updateThemeToggleIndicators(mode) {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    const isDark = mode === 'dark';
    const nextLabel = isDark ? 'light' : 'dark';
    btn.textContent = '';
    btn.setAttribute('aria-label', `Alternar para tema ${nextLabel}`);
    btn.setAttribute('aria-checked', String(isDark));
    btn.title = `Alternar para tema ${nextLabel}`;
  });
}

function applyTheme(mode) {
  const normalized = normalizeThemeMode(mode);
  document.body.setAttribute('data-theme', normalized);
  updateThemeToggleIndicators(normalized);
}

function initTheme() {
  browserAPI.storage.local.get([THEME_STORAGE_KEY], (result) => {
    applyTheme(result[THEME_STORAGE_KEY]);
  });
}

function isIpv4Token(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function isIpv6Token(value) {
  return /^[a-f0-9:]+$/i.test(value) && value.includes(':');
}

function isPrivateIpv4(value) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(value);
}

function extractIpFromCandidateText(text) {
  const tokens = String(text || '').split(/\s+/);
  for (const token of tokens) {
    if (isIpv4Token(token)) return token;
  }
  for (const token of tokens) {
    if (isIpv6Token(token)) return token;
  }
  return '';
}

function chooseBestLocalIp(candidates) {
  const cleaned = [...new Set((Array.isArray(candidates) ? candidates : []).filter(Boolean))];
  if (!cleaned.length) return '';
  const privateIpv4 = cleaned.find((ip) => isIpv4Token(ip) && isPrivateIpv4(ip));
  if (privateIpv4) return privateIpv4;
  const otherIpv4 = cleaned.find((ip) => isIpv4Token(ip));
  if (otherIpv4) return otherIpv4;
  return cleaned[0];
}

function discoverLocalIp() {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === 'undefined') {
      resolve('');
      return;
    }
    const discovered = new Set();
    const connection = new RTCPeerConnection({ iceServers: [] });
    const closeAndResolve = () => {
      try {
        connection.close();
      } catch {}
      resolve(chooseBestLocalIp([...discovered]));
    };
    const timer = setTimeout(closeAndResolve, 2000);
    connection.createDataChannel('ip');
    connection.onicecandidate = (event) => {
      if (event && event.candidate && event.candidate.candidate) {
        const ip = extractIpFromCandidateText(event.candidate.candidate);
        if (ip) discovered.add(ip);
      }
      if (!event || !event.candidate) {
        clearTimeout(timer);
        closeAndResolve();
      }
    };
    connection.createOffer()
      .then((offer) => connection.setLocalDescription(offer))
      .catch(() => {
        clearTimeout(timer);
        closeAndResolve();
      });
  });
}

async function loadLocalIpHeader() {
  const label = document.getElementById('popupLocalIp');
  if (!label) return;
  const ip = await discoverLocalIp();
  label.textContent = `IP local: ${ip || 'Não disponível'}`;
}

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadQuickLinks();
  loadStats();
  loadCompanyName();
  loadLocalIpHeader();
  setupEventListeners();
});

// Load company name into header
function loadCompanyName() {
  browserAPI.storage.local.get(['companyName'], (result) => {
    const name = result.companyName || 'Organife';
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) headerTitle.textContent = name;
  });
}

// Load quick links from storage
function loadQuickLinks() {
  browserAPI.storage.local.get(['quickLinks'], (result) => {
    const links = result.quickLinks || defaultQuickLinks;
    renderQuickLinks(links);
  });
}

// Render quick links in user view
function renderQuickLinks(links) {
  const container = document.getElementById('quickLinksContainer');
  container.innerHTML = links.map(link => `
    <a href="${link.url}" target="_blank" class="quick-link">
      <div class="quick-link-left">
        <svg class="quick-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
        <span class="quick-link-text">${link.name}</span>
      </div>
      <svg class="quick-link-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </a>
  `).join('');
}

// Load stats
function loadStats() {
  browserAPI.storage.local.get(['blockedSites', 'releaseRequests'], (result) => {
    const blockedCount = (result.blockedSites || []).length;
    const requestsCount = (result.releaseRequests || []).length;
    
    document.getElementById('blockedCount').textContent = blockedCount;
    document.getElementById('requestsCount').textContent = requestsCount;
  });
}

function setPasswordPromptVisible(visible) {
  const passwordPrompt = document.getElementById('passwordPrompt');
  const adminAccessContainer = document.querySelector('.admin-access-container');
  passwordPrompt.classList.toggle('hidden', !visible);
  if (adminAccessContainer) {
    adminAccessContainer.classList.toggle('hidden', visible);
  }
}

function getAllowedTabsForRole(role) {
  if (role === 'restricted') return restrictedTabs;
  return ['sites', 'rastreio', 'usuarios', 'solicitacoes', 'logs', 'avisos', 'config'];
}

function getVisibleTabs() {
  return [...document.querySelectorAll('.tab-btn')]
    .filter((btn) => btn.style.display !== 'none')
    .map((btn) => String(btn.dataset.tab || '').trim())
    .filter(Boolean);
}

function setTabsMenuExpanded(expanded) {
  const tabsContainer = document.getElementById('tabsContainer');
  const toggleButton = document.getElementById('toggleTabsMenu');
  if (!tabsContainer || !toggleButton) return;
  tabsContainer.classList.toggle('expanded', expanded);
  tabsContainer.classList.toggle('collapsed', !expanded);
  toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function applyAccessRole(role) {
  const allowedTabs = getAllowedTabsForRole(role);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const tabId = String(btn.dataset.tab || '');
    btn.style.display = allowedTabs.includes(tabId) ? '' : 'none';
    if (!allowedTabs.includes(tabId)) btn.classList.remove('active');
  });
  document.querySelectorAll('.tab-content').forEach((content) => {
    const tabId = String(content.id || '').replace('tab-', '');
    content.style.display = allowedTabs.includes(tabId) ? '' : 'none';
    if (!allowedTabs.includes(tabId)) content.classList.remove('active');
  });
}

// Setup all event listeners
function setupEventListeners() {
  // Admin access button
  document.getElementById('adminAccessBtn').addEventListener('click', () => {
    setPasswordPromptVisible(true);
  });

  // Cancel login
  document.getElementById('cancelLogin').addEventListener('click', () => {
    setPasswordPromptVisible(false);
    document.getElementById('adminPassword').value = '';
  });

  // Submit password
  document.getElementById('submitPassword').addEventListener('click', handleLogin);
  document.getElementById('adminPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Back to user view
  document.getElementById('backToUser').addEventListener('click', () => {
    isAdmin = false;
    currentAccessRole = '';
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('userView').classList.remove('hidden');
    setPasswordPromptVisible(false);
    document.getElementById('adminPassword').value = '';
    applyAccessRole('admin');
    setTabsMenuExpanded(false);
  });

  // Refresh data
  document.getElementById('refreshData').addEventListener('click', loadAdminData);
  document.getElementById('toggleTabsMenu').addEventListener('click', () => {
    const tabsContainer = document.getElementById('tabsContainer');
    const isExpanded = Boolean(
      tabsContainer && tabsContainer.classList
      && typeof tabsContainer.classList.contains === 'function'
      && tabsContainer.classList.contains('expanded')
    );
    setTabsMenuExpanded(!isExpanded);
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });

  // Sites tab
  document.getElementById('saveChanges').addEventListener('click', saveBlockedSites);

  // Rastreio tab
  document.getElementById('refreshLogs').addEventListener('click', loadNavigationHistory);
  document.getElementById('exportCSV').addEventListener('click', exportCSV);
  document.getElementById('clearLogs').addEventListener('click', clearLogs);
  document.getElementById('domainFilter').addEventListener('input', filterHistory);

  // Usuarios tab
  document.getElementById('saveUser').addEventListener('click', saveUser);

  // Logs tab
  document.getElementById('logFilter').addEventListener('change', () => showLogsIdleState());
  document.getElementById('loadRecentLogs').addEventListener('click', () => {
    const filter = document.getElementById('logFilter').value || 'all';
    loadLogs(filter, 10);
  });
  document.getElementById('exportLogs').addEventListener('click', exportLogs);

  // Config tab
  document.getElementById('saveConfig').addEventListener('click', saveConfig);
  document.getElementById('saveNotice').addEventListener('click', saveNotice);
  document.getElementById('addQuickLink').addEventListener('click', addQuickLinkRow);

  const qlc = document.getElementById('quickLinksConfig');
  if (qlc && !qlc.dataset.boundDelete) {
    qlc.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-link');
      if (!btn) return;
      const row = btn.closest('.quick-link-config');
      if (row) row.remove();
    });
    qlc.dataset.boundDelete = '1';
  }
  document.getElementById('backupSettings').addEventListener('click', backupSettings);
  document.getElementById('restoreSettings').addEventListener('click', () => {
    document.getElementById('restoreFile').click();
  });
  document.getElementById('restoreFile').addEventListener('change', restoreSettings);
  document.getElementById('changePassword').addEventListener('click', showChangePasswordModal);
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = normalizeThemeMode(document.body.getAttribute('data-theme'));
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      browserAPI.storage.local.set({ [THEME_STORAGE_KEY]: next });
    });
  });

  // Global actions
  document.getElementById('toggleBlockAll').addEventListener('click', toggleBlockAll);
  document.getElementById('unblockAll').addEventListener('click', unblockAll);
}

// Handle login
function handleLogin() {
  const password = String(document.getElementById('adminPassword').value || '').trim();
  if (!password) {
    alert('Digite a senha de administrador');
    return;
  }
  sendRuntimeMessage({ type: 'verifyPassword', password }, (response) => {
    if (!response) {
      alert('Não foi possível validar a senha. Reabra a extensão e tente novamente.');
      return;
    }
    if (response && response.isValid) {
      isAdmin = true;
      currentAccessRole = response.role === 'restricted' ? 'restricted' : 'admin';
      currentAdminPassword = password;
      document.getElementById('userView').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      setPasswordPromptVisible(false);
      applyAccessRole(currentAccessRole);
      setTabsMenuExpanded(false);
      const startTab = currentAccessRole === 'restricted' ? 'logs' : 'config';
      switchTab(startTab);
      loadAdminData();
    } else {
      alert('Senha invalida');
    }
  });
}

// Switch tabs
function switchTab(tabId) {
  const allowedTabs = getAllowedTabsForRole(currentAccessRole);
  if (!allowedTabs.includes(tabId)) {
    const fallbackTab = allowedTabs[0];
    if (!fallbackTab) return;
    tabId = fallbackTab;
  }

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  // Update progress bar
  const tabs = getVisibleTabs();
  const index = tabs.indexOf(tabId);
  const progress = document.querySelector('.tabs-progress');
  if (progress && index >= 0) {
    progress.style.width = `${100 / tabs.length}%`;
    progress.style.transform = `translateX(${index * 100}%)`;
  }

  setTabsMenuExpanded(false);

  // Load specific tab data
  if (tabId === 'rastreio') loadNavigationHistory();
  if (tabId === 'logs') showLogsIdleState();
  if (tabId === 'solicitacoes') loadReleaseRequests();
  if (tabId === 'config' || tabId === 'avisos') loadConfigData();
}

// Load all admin data
function loadAdminData() {
  browserAPI.storage.local.get([
    'blockedSites',
    'blockedKeywords',
    'allowedLinks',
    'allowedDomains',
    'tempAllowedLinks',
    'totalBlockMode',
    'browserUser'
  ], (result) => {
    document.getElementById('blockedSites').value = (result.blockedSites || []).join('\n');
    document.getElementById('blockedKeywords').value = (result.blockedKeywords || []).join('\n');
    document.getElementById('allowedLinks').value = (result.allowedLinks || []).join('\n');
    document.getElementById('allowedDomains').value = (result.allowedDomains || []).join('\n');
    document.getElementById('tempAllowedLinks').value = (result.tempAllowedLinks || []).join('\n');
    document.getElementById('browserUser').value = result.browserUser || '';

    const blockBtn = document.getElementById('toggleBlockAll');
    if (result.totalBlockMode) {
      blockBtn.textContent = 'Bloqueio Ativo';
      blockBtn.classList.add('active');
    }
  });

  showLogsIdleState();
  loadStats();
}

function readBlockingEntries(id) {
  return String(document.getElementById(id).value || '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sendRuntimeMessageAsync(message) {
  return new Promise((resolve) => {
    sendRuntimeMessage(message, (response) => resolve(response || { success: false }));
  });
}

// Save blocked sites and keywords
async function saveBlockedSites() {
  const sites = readBlockingEntries('blockedSites');
  const keywords = readBlockingEntries('blockedKeywords');
  const links = readBlockingEntries('allowedLinks');
  const domains = readBlockingEntries('allowedDomains');
  const tempLinks = readBlockingEntries('tempAllowedLinks');
  const responses = await Promise.all([
    sendRuntimeMessageAsync({ type: 'updateBlockedSites', password: currentAdminPassword, sites }),
    sendRuntimeMessageAsync({ type: 'updateBlockedKeywords', password: currentAdminPassword, keywords }),
    sendRuntimeMessageAsync({ type: 'updateAllowedLinks', password: currentAdminPassword, links }),
    sendRuntimeMessageAsync({ type: 'updateAllowedDomains', password: currentAdminPassword, domains }),
    sendRuntimeMessageAsync({ type: 'updateTempAllowedLinks', password: currentAdminPassword, links: tempLinks })
  ]);
  if (responses.every((response) => response && response.success === true)) {
    alert('Alteracoes salvas com sucesso');
    loadStats();
    return true;
  }
  alert('Nao foi possivel salvar as regras de bloqueio. Reabra a extensao e tente novamente.');
  return false;
}

function requestActivityLogs(options = {}, callback = () => {}) {
  const payload = {
    type: 'getActivityLogs',
    filter: options.filter || 'all',
    sinceMs: Number(options.sinceMs) || 0,
    limit: Number(options.limit) || 5000
  };
  browserAPI.runtime.sendMessage(payload, (response) => {
    const logs = Array.isArray(response && response.logs) ? response.logs : [];
    callback(logs);
  });
}

// Load navigation history
function loadNavigationHistory() {
  const cutoff = Date.now() - 72 * 60 * 60 * 1000;
  requestActivityLogs({ filter: 'navigation', sinceMs: cutoff, limit: 5000 }, (logs) => {
    renderNavigationHistory(logs);
  });
}

let allHistoryLogs = [];

function renderNavigationHistory(logs) {
  allHistoryLogs = logs;
  
  // Group by date
  const grouped = {};
  logs.forEach(log => {
    const date = new Date(log.timestamp).toLocaleDateString('pt-BR');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(log);
  });

  const uniqueSites = new Set(logs.map(log => {
    try {
      return new URL(log.details.url).hostname;
    } catch {
      return log.details.url;
    }
  }));

  document.getElementById('historyStats').textContent = 
    `${new Date().toLocaleDateString('pt-BR')} — ${logs.length} acessos (${uniqueSites.size} sites)`;

  const container = document.getElementById('historyContent');
  container.innerHTML = logs.slice(0, 50).map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let domain = '';
    let url = log.details.url || '';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }
    
    return `
      <div class="history-row">
        <span class="col-time">${time}</span>
        <div class="col-site">
          <span class="site-domain">${domain}</span>
          <span class="site-url">${url}</span>
        </div>
        <span class="col-user">${log.browserUser || 'Desconhecido'}</span>
      </div>
    `;
  }).join('');
}

function filterHistory() {
  const filter = document.getElementById('domainFilter').value.toLowerCase();
  const filtered = allHistoryLogs.filter(log => {
    const url = (log.details.url || '').toLowerCase();
    return url.includes(filter);
  });
  
  const container = document.getElementById('historyContent');
  container.innerHTML = filtered.slice(0, 50).map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let domain = '';
    let url = log.details.url || '';
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }
    
    return `
      <div class="history-row">
        <span class="col-time">${time}</span>
        <div class="col-site">
          <span class="site-domain">${domain}</span>
          <span class="site-url">${url}</span>
        </div>
        <span class="col-user">${log.browserUser || 'Desconhecido'}</span>
      </div>
    `;
  }).join('');
}

function exportCSV() {
  const csvContent = 'Hora,Site,URL,Usuario\n' + 
    allHistoryLogs.map(log => {
      const time = new Date(log.timestamp).toLocaleString('pt-BR');
      let domain = '';
      let url = log.details.url || '';
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = url;
      }
      return `"${time}","${domain}","${url}","${log.browserUser || 'Desconhecido'}"`;
    }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `navegacao_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(downloadUrl);
}

function clearLogs() {
  if (confirm('Tem certeza que deseja limpar todo o historico?')) {
    browserAPI.runtime.sendMessage({ type: 'clearActivityLogs' }, (response) => {
      if (response && response.success) {
        loadNavigationHistory();
        loadLogs();
        alert('Historico limpo com sucesso');
        return;
      }
      alert('Nao foi possivel limpar o historico');
    });
  }
}

// Save user
function saveUser() {
  const username = document.getElementById('browserUser').value;
  browserAPI.runtime.sendMessage({
    type: 'updateBrowserUser',
    password: currentAdminPassword,
    username
  }, (response) => {
    if (response && response.success) {
      alert('Usuario salvo com sucesso');
    }
  });
}

function showLogsIdleState() {
  const logDisplay = document.getElementById('logDisplay');
  if (!logDisplay) return;
  logDisplay.innerHTML = '<div class="log-entry">Clique em "Carregar 10 Ultimos Logs" para buscar os eventos.</div>';
}

// Load logs
function loadLogs(filter = 'all', limit = 10) {
  requestActivityLogs({ filter, limit }, (filteredLogs) => {
    const logDisplay = document.getElementById('logDisplay');
    if (!filteredLogs.length) {
      logDisplay.innerHTML = '<div class="log-entry">Nenhum log encontrado para o filtro selecionado.</div>';
      return;
    }
    logDisplay.innerHTML = filteredLogs.map(log => `
      <div class="log-entry">
        [${new Date(log.timestamp).toLocaleString('pt-BR')}] ${log.browserUser || log.windowsUser}: ${log.action} - ${JSON.stringify(log.details).substring(0, 100)}
      </div>
    `).join('');
  });
}

function exportLogs() {
  requestActivityLogs({ filter: 'all', limit: 20000 }, (logs) => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Load release requests
function loadReleaseRequests() {
  browserAPI.storage.local.get(['releaseRequests'], (result) => {
    const requests = result.releaseRequests || [];
    const pendingRequests = requests
      .map((req, index) => ({ req, index }))
      .filter(({ req }) => {
        const status = String((req && req.status) || '').toLowerCase().trim();
        return !status || status === 'pendente' || status === 'pending';
      });
    const container = document.getElementById('requestsList');
    container.innerHTML = '';

    if (pendingRequests.length === 0) {
      container.innerHTML = '<p class="empty-state">Nenhuma solicitacao pendente</p>';
      return;
    }

    pendingRequests.forEach(({ req, index }) => {
      const domain = sanitizePlainText(req.domain || 'Domínio não informado', 140) || 'Domínio não informado';
      const reason = sanitizePlainText(req.reason || 'Sem justificativa', 280) || 'Sem justificativa';
      const timestamp = req.timestamp ? new Date(req.timestamp).toLocaleString('pt-BR') : '-';
      const item = document.createElement('div');
      item.className = 'request-item';
      const domainDiv = document.createElement('div');
      domainDiv.className = 'request-domain';
      domainDiv.textContent = domain;
      const reasonDiv = document.createElement('div');
      reasonDiv.className = 'request-reason';
      reasonDiv.textContent = reason;
      const timeDiv = document.createElement('div');
      timeDiv.className = 'request-time';
      timeDiv.textContent = timestamp;
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'request-actions';
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn-success';
      approveBtn.dataset.index = String(index);
      approveBtn.dataset.action = 'approve';
      approveBtn.textContent = 'Aprovar';
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn-danger';
      rejectBtn.dataset.index = String(index);
      rejectBtn.dataset.action = 'reject';
      rejectBtn.textContent = 'Rejeitar';
      actionsDiv.appendChild(approveBtn);
      actionsDiv.appendChild(rejectBtn);
      item.appendChild(domainDiv);
      item.appendChild(reasonDiv);
      item.appendChild(timeDiv);
      item.appendChild(actionsDiv);
      container.appendChild(item);
    });

    // Attach event listeners to buttons
    container.querySelectorAll('[data-action="approve"]').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.index);
        approveRequest(idx);
      });
    });

    container.querySelectorAll('[data-action="reject"]').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.index);
        rejectRequest(idx);
      });
    });
  });
}

// Approve request:
// 1. Remove domain from tempAllowedLinks
// 2. Add domain to allowedDomains (permanent)
// 3. Remove request from list
function approveRequest(index) {
  browserAPI.storage.local.get(['releaseRequests', 'allowedDomains', 'tempAllowedLinks'], (result) => {
    const requests = result.releaseRequests || [];
    const allowedDomains = result.allowedDomains || [];
    let tempAllowedLinks = result.tempAllowedLinks || [];

    if (requests[index]) {
      const domain = requests[index].domain;

      // Move from temp to permanent
      tempAllowedLinks = tempAllowedLinks.filter(d => d !== domain);
      if (!allowedDomains.includes(domain)) {
        allowedDomains.push(domain);
      }
      requests.splice(index, 1);

      browserAPI.storage.local.set({
        releaseRequests: requests,
        allowedDomains,
        tempAllowedLinks
      }, () => {
        browserAPI.runtime.sendMessage({
          type: 'updateAllowedDomains',
          password: currentAdminPassword,
          domains: allowedDomains
        });
        browserAPI.runtime.sendMessage({
          type: 'updateTempAllowedLinks',
          password: currentAdminPassword,
          links: tempAllowedLinks
        });
        loadReleaseRequests();
        loadStats();
        loadAdminData();
        alert('Solicitacao aprovada! Dominio adicionado a lista de permitidos.');
      });
    }
  });
}

// Reject request:
// 1. Remove domain from tempAllowedLinks
// 2. Add domain to blockedSites
// 3. Remove request from list
function rejectRequest(index) {
  browserAPI.storage.local.get(['releaseRequests', 'blockedSites', 'tempAllowedLinks'], (result) => {
    const requests = result.releaseRequests || [];
    const blockedSites = result.blockedSites || [];
    let tempAllowedLinks = result.tempAllowedLinks || [];

    if (requests[index]) {
      const domain = requests[index].domain;

      // Remove from temp and add to blocked
      tempAllowedLinks = tempAllowedLinks.filter(d => d !== domain);
      if (!blockedSites.includes(domain)) {
        blockedSites.push(domain);
      }
      requests.splice(index, 1);

      browserAPI.storage.local.set({
        releaseRequests: requests,
        blockedSites,
        tempAllowedLinks
      }, () => {
        browserAPI.runtime.sendMessage({
          type: 'updateBlockedSites',
          password: currentAdminPassword,
          sites: blockedSites
        });
        browserAPI.runtime.sendMessage({
          type: 'updateBlockedSites',
          password: currentAdminPassword,
          sites: blockedSites
        });
        browserAPI.runtime.sendMessage({
          type: 'updateTempAllowedLinks',
          password: currentAdminPassword,
          links: tempAllowedLinks
        });
        loadReleaseRequests();
        loadStats();
        loadAdminData();
        alert('Solicitacao rejeitada. Dominio adicionado a lista de bloqueados.');
      });
    }
  });
}

// Load config data
function loadConfigData() {
  browserAPI.storage.local.get(['companyName', 'serverUrl', 'quickLinks', 'companyNotice'], (result) => {
    document.getElementById('companyName').value = result.companyName || 'Organife';
    document.getElementById('serverUrl').value = result.serverUrl || 'http://192.168.100.34:1337';
    document.getElementById('companyNotice').value = sanitizeNoticeText(result.companyNotice || '');
    
    const links = result.quickLinks || defaultQuickLinks;
    renderQuickLinksConfig(links);
  });
}

function renderQuickLinksConfig(links) {
  const container = document.getElementById('quickLinksConfig');
  container.innerHTML = links.map((link, index) => `
    <div class="quick-link-config" data-index="${index}">
      <input type="text" class="link-name" value="${link.name}" placeholder="Nome">
      <input type="text" class="link-url" value="${link.url}" placeholder="URL">
      <button class="btn-delete-link" type="button" title="Remover link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `).join('');
}

function addQuickLinkRow() {
  const container = document.getElementById('quickLinksConfig');
  const div = document.createElement('div');
  div.className = 'quick-link-config';
  div.innerHTML = `
    <input type="text" class="link-name" value="" placeholder="Nome">
    <input type="text" class="link-url" value="" placeholder="URL">
    <button class="btn-delete-link" type="button" title="Remover link">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  `;
  container.appendChild(div);
}

function saveConfig() {
  const companyName = document.getElementById('companyName').value.trim();
  const serverUrl = document.getElementById('serverUrl').value.trim();
  const companyNotice = sanitizeNoticeText(document.getElementById('companyNotice').value);
  
  const quickLinks = [];
  document.querySelectorAll('.quick-link-config').forEach(row => {
    const name = row.querySelector('.link-name').value;
    const url = row.querySelector('.link-url').value;
    if (name && url) {
      quickLinks.push({ name, url });
    }
  });

  browserAPI.storage.local.set({
    companyName,
    serverUrl,
    quickLinks,
    companyNotice
  }, () => {
    // Update server URL in background
    browserAPI.runtime.sendMessage({
      type: 'updateServerUrl',
      password: currentAdminPassword,
      serverUrl
    });

    // Update header title immediately so it reflects the new company name
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) headerTitle.textContent = companyName;
    
    loadQuickLinks();
    syncConfigWithServer({ companyName, serverUrl, quickLinks, companyNotice }).finally(() => {
      fetchSettingsFromServer(serverUrl).finally(() => {
        alert('Configuracoes salvas com sucesso');
      });
    });
  });
}

function saveNotice() {
  const companyNotice = sanitizeNoticeText(document.getElementById('companyNotice').value);
  document.getElementById('companyNotice').value = companyNotice;
  browserAPI.storage.local.set({ companyNotice }, () => {
    syncConfigWithServer({ companyNotice }).then((synced) => {
      if (synced) {
        alert('Aviso enviado para o mural da intranet.');
        return;
      }
      alert('Aviso salvo localmente no navegador.');
    });
  });
}

function syncConfigWithServer(payload) {
  return new Promise((resolve) => {
    browserAPI.storage.local.get(['serverUrl'], async (res) => {
      const baseUrl = String(res.serverUrl || '').trim().replace(/\/+$/, '');
      if (!baseUrl) {
        resolve(false);
        return;
      }
      try {
        const response = await fetch(`${baseUrl}/dashboard/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        resolve(response.ok);
      } catch {
        resolve(false);
      }
    });
  });
}

function fetchSettingsFromServer(serverBaseUrl) {
  return new Promise((resolve) => {
    const baseUrl = String(serverBaseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
      resolve(false);
      return;
    }
    fetch(`${baseUrl}/settings`)
      .then((response) => {
        if (!response.ok) throw new Error('fetch-failed');
        return response.json();
      })
      .then((settings) => {
        if (!settings || typeof settings !== 'object') {
          resolve(false);
          return;
        }
        const nextData = {
          adminPassword: settings.adminPassword,
          restrictedPassword: String(settings.restrictedPassword || '').trim(),
          tempPassword: settings.tempPassword,
          blockedKeywords: Array.isArray(settings.blockedKeywords) ? settings.blockedKeywords : [],
          blockedSites: Array.isArray(settings.blockedSites) ? settings.blockedSites : [],
          allowedLinks: Array.isArray(settings.allowedLinks) ? settings.allowedLinks : [],
          allowedDomains: Array.isArray(settings.allowedDomains) ? settings.allowedDomains : [],
          tempAllowedLinks: Array.isArray(settings.tempAllowedLinks) ? settings.tempAllowedLinks : [],
          totalBlockMode: !!settings.totalBlockMode,
          browserUser: String(settings.browserUser || '').trim(),
          companyName: String(settings.companyName || 'Organife').trim() || 'Organife',
          companyNotice: sanitizeNoticeText(settings.companyNotice || ''),
          quickLinks: Array.isArray(settings.quickLinks) ? settings.quickLinks : defaultQuickLinks,
          serverUrl: baseUrl
        };
        browserAPI.storage.local.set(nextData, () => {
          loadAdminData();
          loadConfigData();
          loadQuickLinks();
          resolve(true);
        });
      })
      .catch(() => {
        resolve(false);
      });
  });
}

// Backup settings
function backupSettings() {
  browserAPI.runtime.sendMessage({ type: 'backupSettings', password: currentAdminPassword }, (response) => {
    if (response && response.settings) {
      browserAPI.storage.local.get(['quickLinks', 'companyName', 'serverUrl', 'companyNotice', 'releaseRequests'], (extraResult) => {
        const fullBackup = {
          ...response.settings,
          quickLinks: extraResult.quickLinks || defaultQuickLinks,
          companyName: extraResult.companyName || 'Organife',
          serverUrl: extraResult.serverUrl,
          companyNotice: extraResult.companyNotice || '',
          releaseRequests: extraResult.releaseRequests || []
        };
        
        const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `organife_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  });
}

// Restore settings
function restoreSettings(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const settings = JSON.parse(event.target.result);
        browserAPI.runtime.sendMessage({
          type: 'restoreSettings',
          password: currentAdminPassword,
          settings
        }, (response) => {
          if (response && response.success) {
            // Also restore extra settings
            browserAPI.storage.local.set({
              quickLinks: settings.quickLinks || defaultQuickLinks,
              companyName: settings.companyName || 'Organife',
              serverUrl: settings.serverUrl,
              companyNotice: settings.companyNotice || '',
              releaseRequests: settings.releaseRequests || []
            }, () => {
              alert('Configuracoes restauradas com sucesso');
              loadAdminData();
              loadConfigData();
              loadQuickLinks();
            });
          }
        });
      } catch (error) {
        alert('Arquivo de backup invalido');
      }
    };
    reader.readAsText(file);
  }
}

// Change password modal
function showChangePasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <h3 class="modal-title">Alterar Senha Admin</h3>
      <label class="input-label">Nova Senha</label>
      <input type="password" id="newPassword" class="input-field" placeholder="Digite a nova senha">
      <label class="input-label" style="margin-top: 12px;">Confirmar Senha</label>
      <input type="password" id="confirmPassword" class="input-field" placeholder="Confirme a nova senha">
      <div class="modal-actions">
        <button class="btn-secondary" id="cancelPasswordChange">Cancelar</button>
        <button class="btn-primary" id="saveNewPassword">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#cancelPasswordChange').addEventListener('click', () => {
    modal.remove();
  });

  modal.querySelector('#saveNewPassword').addEventListener('click', () => {
    const newPassword = modal.querySelector('#newPassword').value;
    const confirmPassword = modal.querySelector('#confirmPassword').value;

    if (newPassword !== confirmPassword) {
      alert('As senhas nao coincidem');
      return;
    }

    if (newPassword.length < 4) {
      alert('A senha deve ter pelo menos 4 caracteres');
      return;
    }

    browserAPI.runtime.sendMessage({
      type: 'updateAdminPassword',
      currentPassword: currentAdminPassword,
      newPassword
    }, (response) => {
      if (response && response.success) {
        currentAdminPassword = newPassword;
        alert('Senha alterada com sucesso');
        modal.remove();
      } else {
        alert('Erro ao alterar senha');
      }
    });
  });
}

// Toggle block all
function toggleBlockAll() {
  const btn = document.getElementById('toggleBlockAll');
  const currentState = btn.classList.contains('active');
  
  browserAPI.runtime.sendMessage({
    type: 'updateTotalBlockMode',
    password: currentAdminPassword,
    enabled: !currentState
  }, (response) => {
    if (response && response.success) {
      btn.classList.toggle('active');
      btn.innerHTML = !currentState ? 
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg> Bloqueio Ativo` : 
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg> Bloquear Tudo`;
    }
  });
}

// Unblock all - disable total block mode
function unblockAll() {
  browserAPI.runtime.sendMessage({
    type: 'updateTotalBlockMode',
    password: currentAdminPassword,
    enabled: false
  }, (response) => {
    if (response && response.success) {
      const btn = document.getElementById('toggleBlockAll');
      btn.classList.remove('active');
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
      </svg> Bloquear Tudo`;
      alert('Modo de bloqueio total desativado');
    }
  });
}

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.themeMode) {
    applyTheme(changes.themeMode.newValue);
  }
});
