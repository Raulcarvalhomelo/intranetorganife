const statusEl = document.getElementById('status');
const realtimeBadge = document.getElementById('sseBadge');
const statsEl = document.getElementById('stats');
const API_BASE = '/dashboard/api';
let latestCounts = { requests: 0, logs: 0, blockedSites: 0 };
let refreshTimer = null;
let logsFilterTimer = null;
let requestsFilterTimer = null;
let logsCursor = null;
let logsRows = [];
let logsLoading = false;
let logsAbortController = null;
let sessionInfo = { username: '', role: 'admin' };
const VIEWER_ALLOWED_TABS = ['requests', 'logs', 'notices'];

function listToText(arr) {
  return (arr || []).join('\n');
}

function textToList(v) {
  return String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = '/dashboard/login';
    throw new Error('sessao-expirada');
  }
  if (!res.ok) throw new Error(data.message || `erro ${res.status}`);
  return data;
}

function esc(v) {
  return String(v !== undefined && v !== null ? v : '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function normalizeText(v) {
  return String(v !== undefined && v !== null ? v : '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getLogUser(log) {
  return log.browserUser || log.windowsUser || log.user || log.user_id || (log.data && (log.data.browserUser || log.data.user)) || '-';
}

function getLogBrowser(log) {
  return log.browser || log.browserName || (log.data && (log.data.browser || log.data.browserName)) || '-';
}

function getLogDomain(log) {
  const candidates = [
    log.domain,
    log.hostname,
    log.host,
    log.url,
    log.originalUrl,
    log.referrer,
    log.details && (log.details.domain || log.details.hostname || log.details.host || log.details.url || log.details.href || log.details.site),
    log.data && (log.data.domain || log.data.hostname || log.data.host || log.data.url || log.data.href || log.data.site)
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    try {
      if (raw.includes('://')) return new URL(raw).hostname.toLowerCase();
    } catch {}
    return raw.split('/')[0].split(':')[0].toLowerCase();
  }
  return '-';
}

function getLogPayload(log) {
  const details = log && log.details && typeof log.details === 'object' ? log.details : {};
  const data = log && log.data && typeof log.data === 'object' ? log.data : {};
  const url = String(log.url || log.originalUrl || log.href || details.url || details.href || data.url || data.href || '').trim();
  const title = String(log.title || details.title || data.title || '').trim();
  if (Object.keys(details).length || Object.keys(data).length || url || title) {
    return {
      ...details,
      ...data,
      ...(url ? { url } : {}),
      ...(title ? { title } : {})
    };
  }
  return log;
}

function getQuickLinksFromForm() {
  return [...document.querySelectorAll('.quick-link-config')].map((row) => {
    const nameEl = row.querySelector('.link-name');
    const urlEl = row.querySelector('.link-url');
    const name = String(nameEl ? nameEl.value : '').trim();
    const url = String(urlEl ? urlEl.value : '').trim();
    return { name, url };
  }).filter((item) => item.name && item.url);
}

function renderQuickLinksConfig(links) {
  const container = document.getElementById('quickLinksConfig');
  const list = Array.isArray(links) ? links : [];
  container.innerHTML = list.map((link) => `
    <div class="quick-link-config">
      <input class="link-name" value="${esc(link.name)}" placeholder="Nome" />
      <input class="link-url" value="${esc(link.url)}" placeholder="https://site.com" />
      <button data-remove-link="1">Remover</button>
    </div>
  `).join('');
}

function addQuickLinkRow() {
  const container = document.getElementById('quickLinksConfig');
  const row = document.createElement('div');
  row.className = 'quick-link-config';
  row.innerHTML = `
    <input class="link-name" placeholder="Nome" />
    <input class="link-url" placeholder="https://site.com" />
    <button data-remove-link="1">Remover</button>
  `;
  container.appendChild(row);
}

async function loadSettings() {
  const s = await api('/settings');
  document.getElementById('blockedSites').value = listToText(s.blockedSites);
  document.getElementById('blockedKeywords').value = listToText(s.blockedKeywords);
  document.getElementById('allowedLinks').value = listToText(s.allowedLinks);
  document.getElementById('allowedDomains').value = listToText(s.allowedDomains);
  document.getElementById('tempAllowedLinks').value = listToText(s.tempAllowedLinks);
  document.getElementById('browserUser').value = s.browserUser || '';
  document.getElementById('totalBlockMode').checked = !!s.totalBlockMode;
  latestCounts.blockedSites = Array.isArray(s.blockedSites) ? s.blockedSites.length : 0;
  renderStats();
}

async function loadSession() {
  const session = await api('/session');
  sessionInfo = {
    username: String(session.username || ''),
    role: String(session.role || 'admin')
  };
}

function isViewerSession() {
  return sessionInfo.role === 'viewer';
}

function applySessionPermissions() {
  if (!isViewerSession()) return;
  const navButtons = [...document.querySelectorAll('nav button')];
  navButtons.forEach((btn) => {
    const isAllowed = VIEWER_ALLOWED_TABS.includes(String(btn.dataset.tab || ''));
    btn.style.display = isAllowed ? '' : 'none';
    btn.classList.remove('active');
  });
  document.querySelectorAll('.tab').forEach((tab) => {
    const id = String(tab.id || '').replace('tab-', '');
    const isAllowed = VIEWER_ALLOWED_TABS.includes(id);
    tab.style.display = isAllowed ? '' : 'none';
    tab.classList.remove('active');
  });
  const firstAllowedTab = VIEWER_ALLOWED_TABS[0];
  const firstButton = document.querySelector(`nav button[data-tab="${firstAllowedTab}"]`);
  const firstSection = document.getElementById(`tab-${firstAllowedTab}`);
  if (firstButton) firstButton.classList.add('active');
  if (firstSection) firstSection.classList.add('active');
}

async function loadConfig() {
  const cfg = await api('/config');
  document.getElementById('companyName').value = cfg.companyName || 'Organife';
  document.getElementById('serverUrl').value = cfg.serverUrl || 'http://localhost:1337';
  document.getElementById('companyNotice').value = cfg.companyNotice || '';
  renderQuickLinksConfig(Array.isArray(cfg.quickLinks) ? cfg.quickLinks : []);
}

async function saveSettings() {
  await api('/settings', {
    method: 'POST',
    body: JSON.stringify({
      blockedSites: textToList(document.getElementById('blockedSites').value),
      blockedKeywords: textToList(document.getElementById('blockedKeywords').value),
      allowedLinks: textToList(document.getElementById('allowedLinks').value),
      allowedDomains: textToList(document.getElementById('allowedDomains').value),
      tempAllowedLinks: textToList(document.getElementById('tempAllowedLinks').value),
      browserUser: document.getElementById('browserUser').value.trim(),
      totalBlockMode: document.getElementById('totalBlockMode').checked
    })
  });
  statusEl.textContent = 'Configurações salvas';
}

async function saveConfig() {
  await api('/config', {
    method: 'POST',
    body: JSON.stringify({
      companyName: document.getElementById('companyName').value.trim(),
      serverUrl: document.getElementById('serverUrl').value.trim(),
      quickLinks: getQuickLinksFromForm()
    })
  });
  statusEl.textContent = 'Configurações gerais salvas';
}

async function saveNotice() {
  await api('/config', {
    method: 'POST',
    body: JSON.stringify({
      companyNotice: document.getElementById('companyNotice').value.trim()
    })
  });
  statusEl.textContent = 'Aviso do mural enviado';
}

async function backupSettings() {
  const backup = await api('/backup');
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `organife_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  statusEl.textContent = 'Backup exportado';
}

function restoreSettings(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      await api('/restore', {
        method: 'POST',
        body: JSON.stringify(parsed)
      });
      await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
      statusEl.textContent = 'Backup restaurado';
    } catch {
      statusEl.textContent = 'Arquivo de backup inválido';
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

async function changePasswords() {
  const currentDashboardPassword = document.getElementById('currentDashboardPassword').value;
  const newDashboardPassword = document.getElementById('newDashboardPassword').value.trim();
  const currentDashboardPasswordForAdmin = document.getElementById('currentDashboardPasswordForAdmin').value;
  const newAdminPassword = document.getElementById('newAdminPassword').value.trim();
  const currentDashboardPasswordForViewer = document.getElementById('currentDashboardPasswordForViewer').value;
  const newViewerPassword = document.getElementById('newViewerPassword').value.trim();
  const currentDashboardPasswordForRestricted = document.getElementById('currentDashboardPasswordForRestricted').value;
  const newRestrictedPassword = document.getElementById('newRestrictedPassword').value.trim();

  if (!newDashboardPassword && !newAdminPassword && !newViewerPassword && !newRestrictedPassword) {
    statusEl.textContent = 'Informe pelo menos uma nova senha';
    return;
  }

  const payload = {};
  if (newDashboardPassword) {
    payload.currentDashboardPassword = currentDashboardPassword;
    payload.newDashboardPassword = newDashboardPassword;
  }
  if (newAdminPassword) {
    payload.currentDashboardPasswordForAdmin = currentDashboardPasswordForAdmin;
    payload.newAdminPassword = newAdminPassword;
  }
  if (newViewerPassword) {
    payload.currentDashboardPasswordForViewer = currentDashboardPasswordForViewer;
    payload.newViewerPassword = newViewerPassword;
  }
  if (newRestrictedPassword) {
    payload.currentDashboardPasswordForRestricted = currentDashboardPasswordForRestricted;
    payload.newRestrictedPassword = newRestrictedPassword;
  }

  await api('/passwords', { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('currentDashboardPassword').value = '';
  document.getElementById('newDashboardPassword').value = '';
  document.getElementById('currentDashboardPasswordForAdmin').value = '';
  document.getElementById('newAdminPassword').value = '';
  document.getElementById('currentDashboardPasswordForViewer').value = '';
  document.getElementById('newViewerPassword').value = '';
  document.getElementById('currentDashboardPasswordForRestricted').value = '';
  document.getElementById('newRestrictedPassword').value = '';
  statusEl.textContent = 'Senhas atualizadas';
}

async function loadRequests() {
  const params = new URLSearchParams();
  const userFilter = document.getElementById('requestsUserFilter');
  const userValue = String(userFilter ? userFilter.value : '').trim();
  if (userValue) params.set('user', userValue);
  const rows = await api(`/release-requests${params.toString() ? `?${params.toString()}` : ''}`);
  const normalizedUser = normalizeText(userValue);
  const filteredRows = normalizedUser
    ? rows.filter((r) => normalizeText(r.user).includes(normalizedUser))
    : rows;
  latestCounts.requests = filteredRows.length;
  renderStats();
  const body = document.getElementById('requestsBody');
  body.innerHTML = filteredRows.map((r) => `
    <tr>
      <td>${esc(new Date(r.timestamp).toLocaleString())}</td>
      <td>${esc(r.user)}</td>
      <td>${esc(r.browser || '-')}</td>
      <td>${esc(r.domain)}</td>
      <td>${esc(r.reason)}</td>
      <td>${esc(r.status)}</td>
      <td>
        ${r.status !== 'aprovado_admin' ? `<button data-approve="${esc(r.id)}">Aprovar</button>` : ''}
        ${r.status !== 'bloqueado_admin' ? `<button data-block="${esc(r.id)}">Bloquear</button>` : ''}
      </td>
    </tr>
  `).join('');
  body.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/release-requests/${btn.dataset.approve}/approve`, { method: 'POST' });
      if (isViewerSession()) {
        await loadRequests();
      } else {
        await Promise.all([loadRequests(), loadSettings()]);
      }
    };
  });
  body.querySelectorAll('[data-block]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/release-requests/${btn.dataset.block}/block`, { method: 'POST' });
      if (isViewerSession()) {
        await loadRequests();
      } else {
        await Promise.all([loadRequests(), loadSettings()]);
      }
    };
  });
}

function setupRequestsFilters() {
  const userFilter = document.getElementById('requestsUserFilter');
  if (!userFilter) return;
  userFilter.oninput = () => {
    if (requestsFilterTimer) clearTimeout(requestsFilterTimer);
    requestsFilterTimer = setTimeout(() => {
      loadRequests();
    }, 250);
  };
}

function parseTimeToMinutes(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const [hoursRaw, minutesRaw] = normalized.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function sanitizeTimeInputValue(value) {
  const normalized = String(value || '').trim().replace(/[^\d:]/g, '');
  if (!normalized) return '';
  if (normalized.includes(':')) {
    const [hoursRaw, minutesRaw = ''] = normalized.split(':');
    const hours = hoursRaw.slice(0, 2);
    const minutes = minutesRaw.slice(0, 2);
    return minutes ? `${hours}:${minutes}` : hours;
  }
  const digitsOnly = normalized.slice(0, 4);
  if (digitsOnly.length <= 2) return digitsOnly;
  return `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
}

function normalizeTimeInputValue(value) {
  const hoursOnly = String(value || '').trim();
  if (/^\d{1,2}$/.test(hoursOnly)) {
    const hours = Number(hoursOnly);
    if (Number.isInteger(hours) && hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return '';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}`;
}

function getTimestampMinutes(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function isWithinTimeRange(timestampMinutes, startMinutes, endMinutes) {
  if (timestampMinutes === null) return false;
  if (startMinutes === null && endMinutes === null) return true;
  if (startMinutes !== null && endMinutes !== null) {
    if (startMinutes <= endMinutes) {
      return timestampMinutes >= startMinutes && timestampMinutes <= endMinutes;
    }
    return timestampMinutes >= startMinutes || timestampMinutes <= endMinutes;
  }
  if (startMinutes !== null) return timestampMinutes >= startMinutes;
  return timestampMinutes <= endMinutes;
}

function formatLogDateTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

async function loadLogs(options) {
  const settings = options || {};
  const append = settings.append === true;
  if (logsLoading) return;
  if (!append) {
    logsCursor = null;
    logsRows = [];
  }
  const params = new URLSearchParams({ limit: '50' });
  const user = document.getElementById('logsUserFilter');
  const allUsers = document.getElementById('logsAllUsers');
  const day = document.getElementById('logsDayFilter');
  const startTime = document.getElementById('logsStartTime');
  const endTime = document.getElementById('logsEndTime');
  const search = document.getElementById('logsSearch');
  const domain = document.getElementById('logsDomainFilter');
  const type = document.getElementById('logsTypeFilter');
  const userValue = String(user ? user.value : '').trim();
  const isAllUsers = Boolean(allUsers && allUsers.checked);
  const dayValue = String(day ? day.value : '').trim();
  const startTimeValue = String(startTime ? startTime.value : '').trim();
  const endTimeValue = String(endTime ? endTime.value : '').trim();
  const searchValue = String(search ? search.value : '').trim();
  const domainValue = String(domain ? domain.value : '').trim();
  const typeValue = String(type ? type.value : '').trim();
  const selectedUsers = userValue.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (isAllUsers) params.set('allUsers', '1');
  else if (selectedUsers.length > 1) params.set('users', selectedUsers.join(','));
  else if (selectedUsers.length === 1) params.set('user', selectedUsers[0]);
  if (dayValue) params.set('day', dayValue);
  if (startTimeValue) params.set('startTime', startTimeValue);
  if (endTimeValue) params.set('endTime', endTimeValue);
  if (searchValue) params.set('q', searchValue);
  if (domainValue) params.set('domain', domainValue);
  if (typeValue) params.set('type', typeValue);
  if (append && logsCursor) params.set('cursor', logsCursor);
  if (logsAbortController) logsAbortController.abort();
  logsAbortController = typeof AbortController === 'function' ? new AbortController() : null;
  logsLoading = true;
  const body = document.getElementById('logsBody');
  if (body && !append) body.innerHTML = '<tr><td colspan="6" class="empty-cell">Carregando 50 registros...</td></tr>';
  try {
    const page = await api(`/logs/by-user-day?${params.toString()}`, logsAbortController ? { signal: logsAbortController.signal } : undefined);
    const items = page && Array.isArray(page.items) ? page.items : [];
    logsRows = append ? logsRows.concat(items) : items;
    logsCursor = page && page.hasMore ? page.nextCursor : null;
    latestCounts.logs = logsRows.length;
    renderStats();
    renderLogsRows(logsRows);
    updateLogsPagination(Boolean(page && page.hasMore));
  } catch (error) {
    if (!error || error.name !== 'AbortError') {
      if (body) body.innerHTML = '<tr><td colspan="6" class="empty-cell">Não foi possível carregar os logs.</td></tr>';
      updateLogsPagination(false);
    }
  } finally {
    logsLoading = false;
  }
}

function renderLogsRows(rows) {
  const body = document.getElementById('logsBody');
  if (!body) return;
  body.innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(formatLogDateTime(r.timestamp))}</td>
      <td>${esc(getLogUser(r))}</td>
      <td>${esc(getLogBrowser(r))}</td>
      <td>${esc(getLogDomain(r))}</td>
      <td>${esc(r.type || r.action || '-')}</td>
      <td><button type="button" class="log-details-toggle" data-log-index="${rows.indexOf(r)}">Detalhes</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('.log-details-toggle').forEach((button) => {
    button.onclick = () => {
      const row = rows[Number(button.dataset.logIndex)];
      const details = button.closest('tr').querySelector('.log-details');
      if (details) details.remove();
      else {
        const detailRow = document.createElement('tr');
        detailRow.className = 'log-details';
        detailRow.innerHTML = `<td colspan="6"><pre>${esc(JSON.stringify(getLogPayload(row), null, 2))}</pre></td>`;
        button.closest('tr').after(detailRow);
      }
    };
  });
}

function updateLogsPagination(hasMore) {
  const button = document.getElementById('loadMoreLogs');
  const status = document.getElementById('logsPaginationStatus');
  if (button) button.hidden = !hasMore;
  if (status) status.textContent = logsRows.length ? `${logsRows.length} registros carregados${hasMore ? ' · há mais resultados' : ''}` : 'Nenhum registro encontrado';
}
function setDefaultLogsDay() {

  const dayInput = document.getElementById('logsDayFilter');
  if (!dayInput || dayInput.value) return;
  dayInput.value = new Date().toISOString().slice(0, 10);
}

function setupLogsFilters() {
  setDefaultLogsDay();
  const user = document.getElementById('logsUserFilter');
  const allUsers = document.getElementById('logsAllUsers');
  const day = document.getElementById('logsDayFilter');
  const startTime = document.getElementById('logsStartTime');
  const endTime = document.getElementById('logsEndTime');
  const search = document.getElementById('logsSearch');
  const domain = document.getElementById('logsDomainFilter');
  const type = document.getElementById('logsTypeFilter');
  const refresh = document.getElementById('refreshLogs');
  const refreshActivity = document.getElementById('refreshActivity');
  const loadMore = document.getElementById('loadMoreLogs');
  const triggerByEnter = (event) => {
    if (event && event.key === 'Enter') loadLogs();
  };
  const bindTimeInput = (input) => {
    if (!input) return;
    input.oninput = () => {
      input.value = sanitizeTimeInputValue(input.value);
    };
    input.onblur = () => {
      input.value = normalizeTimeInputValue(input.value);
    };
    input.onkeydown = (event) => {
      if (event && event.key === 'Enter') {
        input.value = normalizeTimeInputValue(input.value);
        loadLogs();
      }
    };
  };
  if (user) user.onkeydown = triggerByEnter;
  if (allUsers) {
    if (user) {
      allUsers.onchange = () => {
        user.disabled = allUsers.checked;
        if (allUsers.checked) user.value = '';
      };
      user.disabled = allUsers.checked;
    } else {
      allUsers.onchange = () => loadLogs();
    }
  }
  if (day) day.onchange = () => {};
  bindTimeInput(startTime);
  bindTimeInput(endTime);
  if (search) search.onkeydown = triggerByEnter;
  if (domain) domain.onkeydown = triggerByEnter;
  if (type) type.onchange = () => {};
  if (refresh) refresh.onclick = () => loadLogs();
  if (refreshActivity) refreshActivity.onclick = () => loadActivity();
  if (loadMore) loadMore.onclick = () => loadLogs({ append: true });
}

function renderStats() {
  statsEl.textContent = `${latestCounts.requests} solicitações | ${latestCounts.logs} logs | ${latestCounts.blockedSites} bloqueios`;
}

function initTabs() {
  const buttons = [...document.querySelectorAll('nav button')];
  buttons.forEach((b) => {
    b.onclick = () => {
      buttons.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.getElementById(`tab-${b.dataset.tab}`).classList.add('active');
    };
  });
}

function initConfigEvents() {
  document.getElementById('saveConfig').onclick = saveConfig;
  document.getElementById('addQuickLink').onclick = addQuickLinkRow;
  document.getElementById('backupSettings').onclick = backupSettings;
  document.getElementById('restoreSettings').onclick = () => document.getElementById('restoreFile').click();
  document.getElementById('restoreFile').onchange = restoreSettings;
  const quickLinksConfig = document.getElementById('quickLinksConfig');
  quickLinksConfig.onclick = (event) => {
    const btn = event.target.closest('[data-remove-link]');
    if (!btn) return;
    const row = btn.closest('.quick-link-config');
    if (row) row.remove();
  };
}

function initNoticesEvents() {
  document.getElementById('saveNotice').onclick = saveNotice;
}

function initRealtime() {
  let retryDelay = 1000;
  let retryTimer = null;
  let socket = null;
  function scheduleConnect() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    } catch (error) {
      scheduleConnect();
      return;
    }
    window.dashboardSocket = socket;
    socket.onopen = () => {
      retryDelay = 1000;
      realtimeBadge.textContent = 'WebSocket online';
      realtimeBadge.classList.remove('offline');
      realtimeBadge.classList.add('online');
      socket.send(JSON.stringify({ type: 'hello', client: 'dashboard' }));
    };
    socket.onmessage = async (event) => {
      let message = {};
      try { message = JSON.parse(event.data || '{}'); } catch (error) { return; }
      if (message.type === 'settings_state') {
        await loadConfig();
        return;
      }
      const eventData = message.payload || {};
      if (message.type !== 'state_update') return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        let nextStatus = 'Atualizado em tempo real';
        if (isViewerSession()) {
          if (eventData.kind !== 'logs') await loadRequests();
          else nextStatus = 'Novos logs disponíveis. Clique em "Atualizar logs brutos"';
        } else if (eventData.kind === 'settings') {
          await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
        } else if (eventData.kind === 'requests') {
          await Promise.all([loadRequests(), loadSettings()]);
        } else if (eventData.kind === 'logs') {
          nextStatus = 'Novos logs disponíveis. Clique em "Atualizar logs brutos"';
        } else {
          await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
        }
        statusEl.textContent = nextStatus;
      }, 150);
    };
    socket.onerror = () => { try { socket.close(); } catch (error) {} };
    socket.onclose = () => {
      realtimeBadge.textContent = 'WebSocket offline';
      realtimeBadge.classList.remove('online');
      realtimeBadge.classList.add('offline');
      statusEl.textContent = 'Conexão em tempo real instável';
      scheduleConnect();
    };
  }
  if (retryTimer) clearTimeout(retryTimer);
  connect();
}
async function boot() {
  try {
    const health = await api('/health');
    await loadSession();
    statusEl.textContent = `Servidor online (${health.now})`;
    initTabs();
    applySessionPermissions();
    if (!isViewerSession()) initConfigEvents();
    initNoticesEvents();
    setupLogsFilters();
    setupRequestsFilters();
    if (!isViewerSession()) {
      document.getElementById('saveSettings').onclick = saveSettings;
      document.getElementById('changePasswords').onclick = changePasswords;
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await fetch('/dashboard/logout', { method: 'POST' });
        window.location.href = '/dashboard/login';
      };
    }
    if (isViewerSession()) {
      await Promise.all([loadConfig(), loadRequests()]);
    } else {
      await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
    }
    initRealtime();
  } catch (e) {
    statusEl.textContent = e.message;
  }
}

boot();
