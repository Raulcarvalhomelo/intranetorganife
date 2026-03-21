const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

const defaultQuickLinks = [
  { name: 'Intranet', url: 'https://intranet.empresa.com' },
  { name: 'Email', url: 'https://mail.empresa.com' },
  { name: 'Suporte TI', url: 'https://suporte.empresa.com' }
];
const THEME_STORAGE_KEY = 'themeMode';
let favoriteLinksCache = [];
let favoritesSearchTerm = '';

function getIdentityPageBase() {
  return browserAPI.runtime.getURL('identity.html');
}

function getIdentityPageUrl(nextUrl) {
  const base = getIdentityPageBase();
  if (!nextUrl) return base;
  return `${base}?next=${encodeURIComponent(nextUrl)}`;
}

function redirectToIdentity() {
  window.location.replace(getIdentityPageUrl(window.location.href));
}

function ensureIdentityBeforeInit(callback) {
  browserAPI.storage.local.get(['browserUser'], (result) => {
    const currentUser = String((result && result.browserUser) || '').trim();
    if (!currentUser) {
      redirectToIdentity();
      return;
    }
    callback();
  });
}

function normalizeText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function sanitizePlainText(value, maxLength = 500) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.slice(0, maxLength);
}

function normalizeThemeMode(value) {
  return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

function updateThemeButtonLabel(mode) {
  const themeToggle = document.getElementById('themeToggleIntranet');
  if (!themeToggle) return;
  const isDark = mode === 'dark';
  const nextLabel = isDark ? 'claro' : 'escuro';
  themeToggle.textContent = '';
  themeToggle.setAttribute('aria-label', `Alternar para tema ${nextLabel}`);
  themeToggle.setAttribute('aria-checked', String(isDark));
  themeToggle.title = `Alternar para tema ${nextLabel}`;
}

function applyTheme(mode) {
  const normalized = normalizeThemeMode(mode);
  document.body.setAttribute('data-theme', normalized);
  updateThemeButtonLabel(normalized);
}

function initTheme() {
  browserAPI.storage.local.get([THEME_STORAGE_KEY], (result) => {
    applyTheme(result[THEME_STORAGE_KEY]);
  });

  const themeToggle = document.getElementById('themeToggleIntranet');
  if (!themeToggle) return;
  themeToggle.addEventListener('click', () => {
    const current = normalizeThemeMode(document.body.getAttribute('data-theme'));
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    browserAPI.storage.local.set({ [THEME_STORAGE_KEY]: next });
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
  const label = document.getElementById('intranetLocalIp');
  if (!label) return;
  const ip = await discoverLocalIp();
  label.textContent = `IP local: ${ip || 'Não disponível'}`;
}

function toSafeLink(link) {
  if (!link || typeof link !== 'object') return null;
  const name = normalizeText(link.name, '');
  const rawUrl = normalizeText(link.url, '');
  if (!name || !rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return {
      name,
      url: parsed.toString(),
      host: parsed.host || parsed.hostname || rawUrl
    };
  } catch {
    return null;
  }
}

function normalizeSearchText(value) {
  return sanitizePlainText(value, 200).toLocaleLowerCase('pt-BR');
}

function renderQuickLinks(links) {
  const linksGrid = document.getElementById('linksGrid');
  const emptyState = document.getElementById('emptyState');
  linksGrid.innerHTML = '';
  const safeLinks = (Array.isArray(links) ? links : []).map(toSafeLink).filter(Boolean);

  if (!safeLinks.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  for (const link of safeLinks) {
    const anchor = document.createElement('a');
    anchor.className = 'quick-link';
    anchor.href = link.url;
    anchor.target = '_self';
    anchor.rel = 'noopener noreferrer';

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'quick-link-name';
    name.textContent = link.name;
    const host = document.createElement('div');
    host.className = 'quick-link-host';
    host.textContent = link.host;

    info.appendChild(name);
    info.appendChild(host);

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '↗';

    anchor.appendChild(info);
    anchor.appendChild(arrow);
    linksGrid.appendChild(anchor);
  }
}

function collectBookmarkLinks(nodes, target = []) {
  if (!Array.isArray(nodes)) return target;
  nodes.forEach((node) => {
    if (!node || typeof node !== 'object') return;
    const rawUrl = normalizeText(node.url, '');
    if (rawUrl) {
      const fallbackName = (() => {
        try {
          return new URL(rawUrl).hostname;
        } catch {
          return rawUrl;
        }
      })();
      target.push({
        name: normalizeText(node.title, fallbackName),
        url: rawUrl
      });
    }
    if (Array.isArray(node.children) && node.children.length) {
      collectBookmarkLinks(node.children, target);
    }
  });
  return target;
}

function renderFavorites(links) {
  const favoritesGrid = document.getElementById('favoritesGrid');
  const emptyFavorites = document.getElementById('emptyFavorites');
  if (!favoritesGrid || !emptyFavorites) return;

  favoritesGrid.innerHTML = '';
  const safeLinks = (Array.isArray(links) ? links : []).map(toSafeLink).filter(Boolean);
  const query = normalizeSearchText(favoritesSearchTerm);
  const filteredLinks = query
    ? safeLinks.filter((link) => normalizeSearchText(`${link.name} ${link.host} ${link.url}`).includes(query))
    : safeLinks;

  if (!safeLinks.length) {
    emptyFavorites.hidden = false;
    emptyFavorites.textContent = 'Nenhum favorito encontrado no navegador.';
    return;
  }

  if (!filteredLinks.length) {
    emptyFavorites.hidden = false;
    emptyFavorites.textContent = 'Nenhum favorito corresponde à busca.';
    return;
  }

  emptyFavorites.hidden = true;
  emptyFavorites.textContent = 'Nenhum favorito encontrado no navegador.';

  filteredLinks.forEach((link) => {
    const anchor = document.createElement('a');
    anchor.className = 'quick-link';
    anchor.href = link.url;
    anchor.target = '_self';
    anchor.rel = 'noopener noreferrer';

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'quick-link-name';
    name.textContent = link.name;
    const host = document.createElement('div');
    host.className = 'quick-link-host';
    host.textContent = link.host;

    info.appendChild(name);
    info.appendChild(host);

    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '↗';

    anchor.appendChild(info);
    anchor.appendChild(arrow);
    favoritesGrid.appendChild(anchor);
  });
}

function loadFavorites() {
  const emptyFavorites = document.getElementById('emptyFavorites');
  if (!browserAPI.bookmarks || typeof browserAPI.bookmarks.getTree !== 'function') {
    if (emptyFavorites) {
      emptyFavorites.hidden = false;
      emptyFavorites.textContent = 'Permissão de favoritos não disponível.';
    }
    return;
  }

  browserAPI.bookmarks.getTree((tree) => {
    if (browserAPI.runtime && browserAPI.runtime.lastError) {
      if (emptyFavorites) {
        emptyFavorites.hidden = false;
        emptyFavorites.textContent = 'Não foi possível carregar os favoritos.';
      }
      renderFavorites([]);
      return;
    }
    const favorites = collectBookmarkLinks(Array.isArray(tree) ? tree : []);
    favoriteLinksCache = favorites;
    renderFavorites(favoriteLinksCache);
  });
}

function initFavoritesSync() {
  const refreshFavoritesBtn = document.getElementById('refreshFavorites');
  if (refreshFavoritesBtn) {
    refreshFavoritesBtn.addEventListener('click', loadFavorites);
  }

  if (!browserAPI.bookmarks) return;
  const reload = () => loadFavorites();
  if (browserAPI.bookmarks.onCreated) browserAPI.bookmarks.onCreated.addListener(reload);
  if (browserAPI.bookmarks.onRemoved) browserAPI.bookmarks.onRemoved.addListener(reload);
  if (browserAPI.bookmarks.onChanged) browserAPI.bookmarks.onChanged.addListener(reload);
  if (browserAPI.bookmarks.onMoved) browserAPI.bookmarks.onMoved.addListener(reload);
  if (browserAPI.bookmarks.onImportEnded) browserAPI.bookmarks.onImportEnded.addListener(reload);
}

function initFavoritesSearch() {
  const favoritesSearchInput = document.getElementById('favoritesSearchInput');
  if (!favoritesSearchInput) return;

  favoritesSearchInput.addEventListener('input', (event) => {
    favoritesSearchTerm = normalizeSearchText(event.target && event.target.value);
    renderFavorites(favoriteLinksCache);
  });
}

function applyHeaderData(data) {
  const companyNameEl = document.getElementById('companyName');
  const userLabelEl = document.getElementById('userLabel');
  const widgetDepartmentEl = document.getElementById('widgetTodosDepartment');
  const companyName = normalizeText(data.companyName, 'Organife');
  const browserUser = normalizeText(data.browserUser, 'Desconhecido');
  const browserDepartment = sanitizePlainText(data.browserDepartment || '', 30);
  companyNameEl.textContent = companyName;
  document.title = `${companyName} - Portal Corporativo`;
  userLabelEl.textContent = `Usuário: ${browserUser}`;
  if (widgetDepartmentEl) {
    widgetDepartmentEl.textContent = browserDepartment;
    widgetDepartmentEl.classList.toggle('is-visible', Boolean(browserDepartment));
    widgetDepartmentEl.setAttribute('aria-hidden', browserDepartment ? 'false' : 'true');
  }
}

function loadPageData() {
  browserAPI.storage.local.get(['companyName', 'quickLinks', 'browserUser', 'browserDepartment'], (result) => {
    applyHeaderData(result || {});
    const links = Array.isArray(result.quickLinks) && result.quickLinks.length
      ? result.quickLinks
      : defaultQuickLinks;
    renderQuickLinks(links);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensureIdentityBeforeInit(() => {
    initTheme();
    loadLocalIpHeader();
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    loadPageData();
    loadFavorites();
    initFavoritesSync();
    initFavoritesSearch();
    updateStatus();
    initNotes();
    initTodos();
    initNotesTodosTxtExport();
    initNotesTodosTxtImport();
    loadNotice();
    loadHistory();
    loadRequests();
    initDragAndDrop();
    setInterval(updateStatus, 60000);
  });
});

function sanitizeNoticeText(value) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') // Remove control chars except newline (\n = 0x0A)
    .trim();
  return text;
}

function toSafeNoticeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (/^https?:$/i.test(parsed.protocol)) return parsed.toString();
    return '';
  } catch {}
  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^[./]+/, '');
  if (!normalized || normalized.includes('..') || /\s/.test(normalized)) return '';
  if (!/^[\w\-./#?=&%:+~]+$/.test(normalized)) return '';
  return browserAPI.runtime.getURL(normalized);
}

function normalizeNoticeUrlToken(value) {
  let token = String(value || '');
  let trailing = '';
  while (/[),.;!?]$/.test(token)) {
    trailing = `${token.slice(-1)}${trailing}`;
    token = token.slice(0, -1);
  }
  return { token, trailing };
}

function createNoticeLink(url, label) {
  const safeUrl = toSafeNoticeUrl(url);
  if (!safeUrl) return null;
  const anchor = document.createElement('a');
  anchor.className = 'notice-link';
  anchor.href = safeUrl;
  anchor.target = '_self';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = label || safeUrl;
  return anchor;
}

function syncNoticeImageViewingState() {
  const hasExpandedImage = Boolean(document.querySelector('.notice-image.notice-image-expanded'));
  document.body.classList.toggle('notice-image-viewing', hasExpandedImage);
}

function createNoticeImage(url, altText) {
  const safeUrl = toSafeNoticeUrl(url);
  if (!safeUrl) return null;
  const image = document.createElement('img');
  image.className = 'notice-image';
  image.src = safeUrl;
  image.alt = String(altText || 'Imagem do aviso').trim() || 'Imagem do aviso';
  image.loading = 'lazy';
  image.onclick = () => {
    const shouldExpand = !image.classList.contains('notice-image-expanded');
    document.querySelectorAll('.notice-image.notice-image-expanded').forEach((node) => {
      node.classList.remove('notice-image-expanded');
    });
    if (shouldExpand) {
      image.classList.add('notice-image-expanded');
    }
    syncNoticeImageViewingState();
  };
  return image;
}

function appendNoticeInline(container, textLine) {
  const tokenPattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s]+)|\b([A-Za-z0-9_\-./]+\.html(?:#[A-Za-z0-9_-]+)?)\b/g;
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(textLine)) !== null) {
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(textLine.slice(lastIndex, match.index)));
    }
    const fullMatch = match[0];
    if (match[1] !== undefined && match[2] !== undefined) {
      const image = createNoticeImage(match[2], match[1]);
      if (image) {
        container.appendChild(image);
      } else {
        container.appendChild(document.createTextNode(fullMatch));
      }
    } else if (match[3] !== undefined && match[4] !== undefined) {
      const link = createNoticeLink(match[4], match[3]);
      if (link) {
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(fullMatch));
      }
    } else if (match[5] !== undefined) {
      const { token, trailing } = normalizeNoticeUrlToken(match[5]);
      const link = createNoticeLink(token, token);
      if (link) {
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(fullMatch));
      }
      if (trailing) {
        container.appendChild(document.createTextNode(trailing));
      }
    } else if (match[6] !== undefined) {
      const link = createNoticeLink(match[6], match[6]);
      if (link) {
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(fullMatch));
      }
    } else {
      container.appendChild(document.createTextNode(fullMatch));
    }
    lastIndex = tokenPattern.lastIndex;
  }
  if (lastIndex < textLine.length) {
    container.appendChild(document.createTextNode(textLine.slice(lastIndex)));
  }
}

function renderNoticeContent(container, noticeText) {
  document.body.classList.remove('notice-image-viewing');
  container.textContent = '';
  const lines = String(noticeText || '').split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      container.appendChild(document.createElement('br'));
    }
    const imageLine = line.trim().match(/^img:\s*(\S+)$/i);
    if (imageLine) {
      const image = createNoticeImage(imageLine[1], 'Imagem do aviso');
      if (image) {
        container.appendChild(image);
        return;
      }
    }
    appendNoticeInline(container, line);
  });
}

// --- Notice Board Logic ---
function loadNotice() {
  browserAPI.storage.local.get(['companyNotice', 'savedNoticeContent', 'noticeCollapsed'], (result) => {
    const noticeBoard = document.getElementById('noticeBoard');
    const noticeContent = document.getElementById('noticeContent');
    const noticeToggle = document.getElementById('noticeToggle');
    
    // Use the new sanitizer that preserves newlines and doesn't truncate
    const currentNotice = sanitizeNoticeText(result.companyNotice);
    const savedNotice = result.savedNoticeContent || '';
    let isCollapsed = result.noticeCollapsed || false;

    // Check if it's a new notice
    if (currentNotice !== savedNotice) {
      // New notice detected! Force expand and save new content
      isCollapsed = false;
      browserAPI.storage.local.set({
        savedNoticeContent: currentNotice,
        noticeCollapsed: false
      });
    }

    if (currentNotice) {
      renderNoticeContent(noticeContent, currentNotice);
      noticeBoard.hidden = false;
      
      // Apply collapsed state
      updateNoticeState(isCollapsed);

      // Setup toggle button
      noticeToggle.onclick = () => {
        const newState = !noticeBoard.classList.contains('collapsed');
        updateNoticeState(newState);
        browserAPI.storage.local.set({ noticeCollapsed: newState });
      };

    } else {
      noticeContent.textContent = '';
      noticeBoard.hidden = true;
    }
  });
}

function updateNoticeState(collapsed) {
  const noticeBoard = document.getElementById('noticeBoard');
  const noticeToggle = document.getElementById('noticeToggle');
  
  if (collapsed) {
    noticeBoard.classList.add('collapsed');
    noticeToggle.textContent = 'Ler Aviso';
  } else {
    noticeBoard.classList.remove('collapsed');
    noticeToggle.textContent = 'Ocultar';
  }
}

// --- History Logic ---
function loadHistory() {
  const historyList = document.getElementById('historyList');
  const emptyHistory = document.getElementById('emptyHistory');
  
  if (!browserAPI.history) {
    emptyHistory.textContent = "Permissão de histórico não disponível.";
    emptyHistory.hidden = false;
    return;
  }

  browserAPI.history.search({text: '', maxResults: 50, startTime: 0}, (historyItems) => {
    // Filter internal/blocked pages
    const filtered = historyItems.filter(item => {
        if (!item.url) return false;
        const url = item.url.toLowerCase();
        return !url.startsWith('chrome-extension:') && 
               !url.startsWith('moz-extension:') &&
               !url.startsWith('about:') &&
               !url.includes('intranet.html') &&
               !url.includes('blocked.html') &&
               !url.includes('identity.html');
    }).slice(0, 5);

    historyList.innerHTML = '';
    
    if (filtered.length === 0) {
      emptyHistory.hidden = false;
      return;
    }
    
    emptyHistory.hidden = true;
    
    filtered.forEach(item => {
        const anchor = document.createElement('a');
        anchor.className = 'history-item';
        anchor.href = item.url;
        
        let domain = item.url;
        try {
            domain = new URL(item.url).hostname;
        } catch (e) {}

        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        
        anchor.innerHTML = `
            <img src="${faviconUrl}" class="history-favicon" alt="" onerror="this.style.display='none'">
            <div class="history-info">
                <div class="history-title">${item.title || domain}</div>
                <div class="history-url">${domain}</div>
            </div>
        `;
        historyList.appendChild(anchor);
    });
  });
}

// --- Requests Logic ---
function normalizeUserName(value) {
  return String(value || '').trim().toLowerCase();
}

function mapRequestStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved' || normalized === 'aprovado' || normalized === 'aprovado_admin') {
    return { statusClass: 'status-approved', statusText: 'Aprovado' };
  }
  if (normalized === 'rejected' || normalized === 'rejeitado' || normalized === 'bloqueado_admin') {
    return { statusClass: 'status-rejected', statusText: 'Rejeitado' };
  }
  return { statusClass: 'status-pending', statusText: 'Pendente' };
}

async function loadRequests() {
  const requestsList = document.getElementById('requestsList');
  const emptyRequests = document.getElementById('emptyRequests');
  const localData = await new Promise((resolve) => {
    browserAPI.storage.local.get(['releaseRequests', 'browserUser'], resolve);
  });

  const currentUser = normalizeUserName(localData.browserUser);
  let requests = Array.isArray(localData.releaseRequests) ? localData.releaseRequests : [];

  if (currentUser && currentUser !== 'desconhecido') {
    requests = requests.filter((request) => {
      const requestUser = normalizeUserName((request && (request.user || request.browserUser)) || '');
      return requestUser === currentUser;
    });
  }

  requests.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const recent = requests.slice(0, 5);

  requestsList.innerHTML = '';

  if (recent.length === 0) {
    emptyRequests.hidden = false;
    return;
  }

  emptyRequests.hidden = true;

  recent.forEach((req) => {
    const div = document.createElement('div');
    div.className = 'request-item';

    const date = req.timestamp ? new Date(req.timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '-';

    const statusMapped = mapRequestStatus(req.status);
    const domain = sanitizePlainText(req.domain || 'Dominio', 140) || 'Dominio';
    const requestUser = sanitizePlainText((req && (req.user || req.browserUser)) || 'Desconhecido', 140) || 'Desconhecido';
    const header = document.createElement('div');
    header.className = 'request-header';
    const domainSpan = document.createElement('span');
    domainSpan.className = 'request-domain';
    domainSpan.textContent = domain;
    const statusSpan = document.createElement('span');
    statusSpan.className = `request-status ${statusMapped.statusClass}`;
    statusSpan.textContent = statusMapped.statusText;
    const userDiv = document.createElement('div');
    userDiv.className = 'request-user';
    userDiv.textContent = requestUser;
    const dateDiv = document.createElement('div');
    dateDiv.className = 'request-date';
    dateDiv.textContent = date;
    header.appendChild(domainSpan);
    header.appendChild(statusSpan);
    div.appendChild(header);
    div.appendChild(userDiv);
    div.appendChild(dateDiv);
    requestsList.appendChild(div);
  });
}

// --- Status Logic ---
function getBrasiliaHour() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utc - (3 * 3600000));
  return brasiliaTime.getHours();
}

function updateStatus() {
  const hour = getBrasiliaHour();
  const isLunchTime = (hour === 12);
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  
  // Remove existing classes
  statusBadge.classList.remove('free', 'restricted');
  
  if (isLunchTime) {
    statusBadge.classList.add('free');
    statusText.textContent = 'Horário Livre (Almoço)';
  } else {
    statusBadge.classList.add('restricted');
    statusText.textContent = 'Navegação Corporativa';
  }
}

async function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  const textEl = document.getElementById('connectionStatusText');
  if (!statusEl || !textEl) return;
  const isOnline = typeof navigator === 'undefined' ? true : Boolean(navigator.onLine);
  statusEl.classList.remove('online', 'offline');
  statusEl.classList.add(isOnline ? 'online' : 'offline');
  textEl.textContent = isOnline ? 'Sincronizado' : 'Não Sincronizado';
}

// --- Notes Logic ---
function initNotes() {
  const notesArea = document.getElementById('notesArea');
  
  // Load saved notes
  browserAPI.storage.local.get(['userNotes'], (result) => {
    if (result.userNotes) {
      notesArea.value = result.userNotes;
    }
  });

  // Save on input (debounced)
  let timeout;
  notesArea.addEventListener('input', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      browserAPI.storage.local.set({ userNotes: notesArea.value });
    }, 500);
  });
}

function initNotesTodosTxtExport() {
  const exportBtn = document.getElementById('exportNotesTodosTxt');
  if (!exportBtn) return;

  const defaultTitle = 'Exportar notas e tarefas (.txt)';
  exportBtn.addEventListener('click', () => {
    const notesArea = document.getElementById('notesArea');
    browserAPI.storage.local.get(['userNotes', 'userTodos', 'browserUser', 'companyName'], (result) => {
      const now = new Date();
      const companyName = normalizeText(result.companyName, 'Organife');
      const userName = normalizeText(result.browserUser, 'Desconhecido');
      const notesValue = String((notesArea && notesArea.value) || result.userNotes || '')
        .replace(/\r\n/g, '\n')
        .trim();
      const todoList = (Array.isArray(result.userTodos) ? result.userTodos : [])
        .map((todo) => {
          if (!todo || typeof todo !== 'object') return null;
          const text = sanitizePlainText(todo.text, 200);
          if (!text) return null;
          return {
            text,
            completed: Boolean(todo.completed)
          };
        })
        .filter(Boolean);

      const fileUserToken = userName
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'usuario';
      const dateToken = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileName = `Organife-Notas-Tarefas-${fileUserToken}-${dateToken}.txt`;
      const notesText = notesValue || 'Sem anotações.';
      const todosText = todoList.length
        ? todoList.map((todo) => `${todo.completed ? '[x]' : '[ ]'} ${todo.text}`).join('\n')
        : 'Sem tarefas cadastradas.';
      const exportText = [
        `${companyName} — BACKUP DO USUÁRIO`,
        `Data: ${now.toLocaleString('pt-BR', { hour12: false })}`,
        `Usuário: ${userName}`,
        '',
        '=== NOTAS ===',
        notesText,
        '',
        '=== TAREFAS ===',
        todosText,
        ''
      ].join('\n');

      const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 0);

      const defaultIcon = exportBtn.textContent;
      exportBtn.textContent = '✅';
      exportBtn.title = 'Exportado';
      setTimeout(() => {
        exportBtn.textContent = defaultIcon;
        exportBtn.title = defaultTitle;
      }, 1200);
    });
  });
}

function parseImportedNotesTodosText(rawText) {
  const text = String(rawText || '').replace(/\r\n/g, '\n');
  const notesMatch = text.match(/(?:^|\n)===\s*NOTAS\s*===\s*\n([\s\S]*?)(?=\n===\s*TAREFAS\s*===|\s*$)/i);
  const tasksMatch = text.match(/(?:^|\n)===\s*TAREFAS\s*===\s*\n([\s\S]*)$/i);
  const notes = String((notesMatch && notesMatch[1]) || '').trim();
  const rawTasks = String((tasksMatch && tasksMatch[1]) || '').split('\n');
  const todos = rawTasks
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const checked = line.match(/^\[(x|X)\]\s*(.+)$/);
      if (checked) {
        return { text: sanitizePlainText(checked[2], 200), completed: true };
      }
      const unchecked = line.match(/^\[\s\]\s*(.+)$/);
      if (unchecked) {
        return { text: sanitizePlainText(unchecked[1], 200), completed: false };
      }
      const bullet = line.match(/^-+\s*(.+)$/);
      if (bullet) {
        return { text: sanitizePlainText(bullet[1], 200), completed: false };
      }
      return { text: sanitizePlainText(line, 200), completed: false };
    })
    .filter((todo) => todo.text);
  return { notes, todos };
}

function initNotesTodosTxtImport() {
  const importBtn = document.getElementById('importNotesTodosTxt');
  const importInput = document.getElementById('importNotesTodosTxtInput');
  if (!importBtn || !importInput) return;

  const defaultIcon = importBtn.textContent;
  const defaultTitle = 'Importar notas e tarefas (.txt)';

  function resetButton() {
    importBtn.textContent = defaultIcon;
    importBtn.title = defaultTitle;
  }

  function setImportedState() {
    importBtn.textContent = '✅';
    importBtn.title = 'Importado';
    setTimeout(resetButton, 1200);
  }

  function setErrorState() {
    importBtn.textContent = '⚠️';
    importBtn.title = 'Arquivo inválido';
    setTimeout(resetButton, 1500);
  }

  importBtn.addEventListener('click', () => {
    importInput.value = '';
    importInput.click();
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseImportedNotesTodosText(content);
      if (!parsed.notes && !parsed.todos.length) {
        setErrorState();
        return;
      }

      const notesArea = document.getElementById('notesArea');
      if (notesArea) {
        notesArea.value = parsed.notes;
      }

      const now = Date.now();
      const todosToStore = parsed.todos.map((todo, index) => ({
        id: `${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        text: todo.text,
        completed: Boolean(todo.completed),
        createdAt: now + index
      }));

      browserAPI.storage.local.set({
        userNotes: parsed.notes,
        userTodos: todosToStore
      });

      if (typeof window.__organifeSetTodosFromImport === 'function') {
        window.__organifeSetTodosFromImport(todosToStore);
      }

      setImportedState();
    };
    reader.onerror = () => {
      setErrorState();
    };
    reader.readAsText(file, 'utf-8');
  });
}

// --- Todo Logic ---
function initTodos() {
  const todoForm = document.getElementById('todoForm');
  const todoInput = document.getElementById('todoInput');
  const clearBtn = document.getElementById('clearCompletedTodos');
  const toggleAllBtn = document.getElementById('toggleAllTodos');
  const todoSearchInput = document.getElementById('todoSearchInput');
  const priorityFilterInput = document.getElementById('priorityFilterInput');
  const departmentFilterInput = document.getElementById('departmentFilterInput');
  const tagFilterInput = document.getElementById('tagFilterInput');
  const openKanbanBtn = document.getElementById('openKanbanBtn');
  const closeKanbanBtn = document.getElementById('closeKanbanBtn');
  const kanbanOverlay = document.getElementById('kanbanOverlay');
  const kanbanTodoList = document.getElementById('kanbanTodoList');
  const kanbanDoingList = document.getElementById('kanbanDoingList');
  const kanbanDoneList = document.getElementById('kanbanDoneList');
  const kanbanCountTodo = document.getElementById('kanbanCountTodo');
  const kanbanCountDoing = document.getElementById('kanbanCountDoing');
  const kanbanUrgentSummaryItem = document.getElementById('kanbanUrgentSummaryItem');
  const kanbanCountUrgentDepartment = document.getElementById('kanbanCountUrgentDepartment');
  const kanbanCountDone = document.getElementById('kanbanCountDone');
  const kanbanCountTotal = document.getElementById('kanbanCountTotal');
  const kanbanColumnCountTodo = document.getElementById('kanbanColumnCountTodo');
  const kanbanColumnCountDoing = document.getElementById('kanbanColumnCountDoing');
  const kanbanColumnCountDone = document.getElementById('kanbanColumnCountDone');
  const kanbanDetailsPanel = document.getElementById('kanbanDetailsPanel');
  const closeKanbanDetailsBtn = document.getElementById('closeKanbanDetailsBtn');
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskPrioritySelect = document.getElementById('taskPrioritySelect');
  const taskDepartmentSelect = document.getElementById('taskDepartmentSelect');
  const addTaskDepartmentBtn = document.getElementById('addTaskDepartmentBtn');
  const taskDepartmentsList = document.getElementById('taskDepartmentsList');
  const taskDueDateInput = document.getElementById('taskDueDateInput');
  const taskTagInput = document.getElementById('taskTagInput');
  const addTaskTagBtn = document.getElementById('addTaskTagBtn');
  const taskTagsList = document.getElementById('taskTagsList');
  const taskAttachmentLabelInput = document.getElementById('taskAttachmentLabelInput');
  const taskAttachmentUrlInput = document.getElementById('taskAttachmentUrlInput');
  const pickTaskAttachmentFileBtn = document.getElementById('pickTaskAttachmentFileBtn');
  const addTaskAttachmentBtn = document.getElementById('addTaskAttachmentBtn');
  const taskAttachmentsList = document.getElementById('taskAttachmentsList');
  const taskDescriptionInput = document.getElementById('taskDescriptionInput');
  const cancelTaskDetailsBtn = document.getElementById('cancelTaskDetailsBtn');
  const saveTaskDetailsBtn = document.getElementById('saveTaskDetailsBtn');
  const refreshKanbanSnapshotBtns = [
    document.getElementById('refreshKanbanSnapshotBtn'),
    document.getElementById('refreshKanbanSnapshotBtnWidget')
  ].filter(Boolean);
  if (
    !todoForm || !todoInput || !clearBtn || !toggleAllBtn || !todoSearchInput
    || !priorityFilterInput || !departmentFilterInput || !tagFilterInput
    || !openKanbanBtn || !closeKanbanBtn || !kanbanOverlay
    || !kanbanTodoList || !kanbanDoingList || !kanbanDoneList
    || !kanbanCountTodo || !kanbanCountDoing || !kanbanUrgentSummaryItem || !kanbanCountUrgentDepartment
    || !kanbanCountDone || !kanbanCountTotal
    || !kanbanColumnCountTodo || !kanbanColumnCountDoing || !kanbanColumnCountDone
    || !kanbanDetailsPanel || !closeKanbanDetailsBtn
    || !taskTitleInput || !taskPrioritySelect || !taskDepartmentSelect || !addTaskDepartmentBtn || !taskDepartmentsList || !taskDueDateInput
    || !taskTagInput || !addTaskTagBtn || !taskTagsList
    || !taskAttachmentLabelInput || !taskAttachmentUrlInput || !pickTaskAttachmentFileBtn || !addTaskAttachmentBtn || !taskAttachmentsList
    || !taskDescriptionInput || !cancelTaskDetailsBtn || !saveTaskDetailsBtn
  ) {
    return;
  }
  const isKanbanPageMode = new URLSearchParams(window.location.search).get('view') === 'kanban';
  if (isKanbanPageMode) {
    document.body.classList.add('kanban-page-mode');
    document.title = 'Kanban - Portal Corporativo';
    closeKanbanBtn.textContent = 'Voltar ao portal';
  }

  const statuses = ['todo', 'doing', 'done'];
  const priorityOptions = ['low', 'med', 'high', 'urgent'];
  const departmentOptions = ['Fiscal', 'DP', 'Recepção', 'Contabil', 'Legal', 'Administrativo'];
  const nativeAttachmentAllowedExtensions = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
    'zip', 'rar', '7z',
    'txt', 'csv', 'xml', 'json', 'html', 'htm'
  ];
  const priorityLabels = {
    low: 'Baixa',
    med: 'Média',
    high: 'Alta',
    urgent: 'Urgente'
  };
  const listByStatus = {
    todo: kanbanTodoList,
    doing: kanbanDoingList,
    done: kanbanDoneList
  };
  let todosState = [];
  let todoSearchTerm = '';
  let priorityFilterValue = 'all';
  let departmentFilterTerm = '';
  let tagFilterTerm = '';
  let orderByStatusState = {
    todo: [],
    doing: [],
    done: []
  };
  let draggingTodoId = '';
  let detailsTodoId = '';
  let currentUserDepartment = '';
  let pendingChanges = [];
  let isSyncInProgress = false;
  let detailsDraftDepartments = [];
  let detailsDraftTags = [];
  let detailsDraftAttachments = [];

  function getSafeHttpUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (!/^(https?|file):$/i.test(parsed.protocol)) return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function normalizePriority(value) {
    const priority = sanitizePlainText(value || '', 20).toLowerCase();
    return priorityOptions.includes(priority) ? priority : 'med';
  }

  function normalizeTag(value) {
    return sanitizePlainText(value, 24);
  }

  function normalizeDepartment(value) {
    const department = sanitizePlainText(value, 60);
    if (!department) return '';
    const normalizedTarget = normalizeSearchText(department);
    const knownDepartment = departmentOptions.find((option) => normalizeSearchText(option) === normalizedTarget);
    return knownDepartment || department;
  }

  function normalizeDepartments(values, legacyDepartment = '') {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];
    [...source, legacyDepartment].forEach((value) => {
      const department = normalizeDepartment(value);
      if (!department) return;
      const key = normalizeSearchText(department);
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(department);
    });
    return normalized;
  }

  function getTodoDepartments(todo) {
    return normalizeDepartments(todo && todo.departments, todo && todo.department);
  }

  function normalizeDueAt(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function normalizeAttachments(values) {
    const source = Array.isArray(values) ? values : [];
    return source
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const safeUrl = getSafeHttpUrl(item.url);
        if (!safeUrl) return null;
        const label = sanitizePlainText(item.label || '', 40) || safeUrl;
        const rawId = sanitizePlainText(item.id || '', 80);
        const fallbackId = sanitizePlainText(`${index}-${label}-${safeUrl}`, 80);
        return {
          id: rawId || fallbackId,
          label,
          url: safeUrl
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  function normalizeTodo(todo, fallbackIndex) {
    if (!todo || typeof todo !== 'object') return null;
    const text = sanitizePlainText(todo.text, 200);
    if (!text) return null;
    const createdAt = Number(todo.createdAt) || Date.now();
    const rawId = sanitizePlainText(todo.id || '', 80);
    const id = rawId || `${createdAt}-${fallbackIndex}`;
    const rawStatus = sanitizePlainText(todo.status || '', 20).toLowerCase();
    const status = statuses.includes(rawStatus) ? rawStatus : (todo.completed ? 'done' : 'todo');
    const tags = (Array.isArray(todo.tags) ? todo.tags : [])
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
      .slice(0, 10);
    return {
      id,
      text,
      completed: status === 'done',
      createdAt,
      updatedAt: Number(todo.updatedAt) || createdAt,
      deleted: Number(todo.deleted) ? 1 : 0,
      status,
      priority: normalizePriority(todo.priority),
      departments: normalizeDepartments(todo.departments, todo.department),
      department: normalizeDepartment(todo.department || ''),
      dueAt: normalizeDueAt(todo.dueAt),
      tags,
      attachments: normalizeAttachments(todo.attachments),
      description: sanitizePlainText(todo.description || '', 2000)
    };
  }

  function normalizeTodoList(todos) {
    return (Array.isArray(todos) ? todos : [])
      .map((todo, index) => normalizeTodo(todo, index))
      .filter(Boolean);
  }

  function normalizeOrderByStatus(orderCandidate, todos) {
    const validIds = new Set(todos.map((todo) => todo.id));
    const nextOrder = { todo: [], doing: [], done: [] };
    statuses.forEach((status) => {
      const seen = new Set();
      const rawIds = Array.isArray(orderCandidate && orderCandidate[status]) ? orderCandidate[status] : [];
      rawIds.forEach((value) => {
        const id = sanitizePlainText(value || '', 80);
        if (id && validIds.has(id) && !seen.has(id)) {
          nextOrder[status].push(id);
          seen.add(id);
        }
      });
      const missing = todos
        .filter((todo) => todo.status === status && !seen.has(todo.id))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((todo) => todo.id);
      nextOrder[status].push(...missing);
    });
    return nextOrder;
  }

  function syncStatusAndOrder() {
    todosState = normalizeTodoList(todosState);
    todosState = todosState.map((todo) => ({
      ...todo,
      completed: todo.status === 'done'
    }));
    orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
  }

  function getSortedTodosForStatus(status) {
    const indexById = new Map(orderByStatusState[status].map((id, index) => [id, index]));
    return todosState
      .filter((todo) => todo.status === status)
      .sort((a, b) => {
        const aIndex = indexById.has(a.id) ? indexById.get(a.id) : Number.MAX_SAFE_INTEGER;
        const bIndex = indexById.has(b.id) ? indexById.get(b.id) : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.createdAt - b.createdAt;
      });
  }

  function updateToggleAllButton() {
    const hasTodos = todosState.length > 0;
    const allCompleted = hasTodos && todosState.every((todo) => todo.status === 'done');
    toggleAllBtn.textContent = allCompleted ? 'Reabrir todas' : 'Concluir todas';
    toggleAllBtn.title = allCompleted ? 'Mover todas para A fazer' : 'Mover todas para Concluído';
    toggleAllBtn.disabled = !hasTodos;
  }

  function updateSummary() {
    const todoCount = todosState.filter((todo) => todo.status === 'todo').length;
    const doingCount = todosState.filter((todo) => todo.status === 'doing').length;
    const doneCount = todosState.filter((todo) => todo.status === 'done').length;
    const hasDepartmentSelected = Boolean(currentUserDepartment);
    const normalizedUserDepartment = normalizeSearchText(currentUserDepartment);
    const urgentDepartmentCount = hasDepartmentSelected
      ? todosState.filter((todo) => (
          todo.priority === 'urgent'
          && getTodoDepartments(todo).some((department) => normalizeSearchText(department) === normalizedUserDepartment)
        )).length
      : 0;
    kanbanCountTodo.textContent = String(todoCount);
    kanbanCountDoing.textContent = String(doingCount);
    kanbanUrgentSummaryItem.hidden = !hasDepartmentSelected;
    kanbanCountUrgentDepartment.textContent = String(urgentDepartmentCount);
    kanbanCountDone.textContent = String(doneCount);
    kanbanCountTotal.textContent = String(todosState.length);
    kanbanColumnCountTodo.textContent = String(todoCount);
    kanbanColumnCountDoing.textContent = String(doingCount);
    kanbanColumnCountDone.textContent = String(doneCount);
  }

  function formatTodoDate(value) {
    const date = new Date(Number(value) || Date.now());
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  function formatDueDate(value) {
    const dueAt = Number(value);
    if (!Number.isFinite(dueAt) || dueAt <= 0) return '';
    return new Date(dueAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function isSameLocalDay(first, second) {
    const firstDate = new Date(first);
    const secondDate = new Date(second);
    return firstDate.getFullYear() === secondDate.getFullYear()
      && firstDate.getMonth() === secondDate.getMonth()
      && firstDate.getDate() === secondDate.getDate();
  }

  function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function hasActiveFilters() {
    return Boolean(todoSearchTerm || departmentFilterTerm || tagFilterTerm || priorityFilterValue !== 'all');
  }

  function toInputDateValue(timestamp) {
    const value = Number(timestamp);
    if (!Number.isFinite(value) || value <= 0) return '';
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromInputDateValue(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parts = text.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
    const [year, month, day] = parts;
    return new Date(year, month - 1, day).getTime();
  }

  function getTodoById(todoId) {
    return todosState.find((todo) => todo.id === todoId) || null;
  }

  function renderDetailsTags() {
    taskTagsList.innerHTML = '';
    if (!detailsDraftTags.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhuma tag adicionada';
      taskTagsList.appendChild(empty);
      return;
    }
    detailsDraftTags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'kanban-chip';
      const text = document.createElement('span');
      text.className = 'kanban-chip-text';
      text.textContent = tag;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover tag';
      removeBtn.addEventListener('click', () => {
        detailsDraftTags = detailsDraftTags.filter((value) => value !== tag);
        renderDetailsTags();
      });
      chip.appendChild(text);
      chip.appendChild(removeBtn);
      taskTagsList.appendChild(chip);
    });
  }

  function renderDetailsDepartments() {
    taskDepartmentsList.innerHTML = '';
    if (!detailsDraftDepartments.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhum departamento adicionado';
      taskDepartmentsList.appendChild(empty);
      return;
    }
    detailsDraftDepartments.forEach((department) => {
      const chip = document.createElement('span');
      chip.className = 'kanban-chip';
      const text = document.createElement('span');
      text.className = 'kanban-chip-text';
      text.textContent = department;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover departamento';
      removeBtn.addEventListener('click', () => {
        const normalizedDepartment = normalizeSearchText(department);
        detailsDraftDepartments = detailsDraftDepartments
          .filter((value) => normalizeSearchText(value) !== normalizedDepartment);
        renderDetailsDepartments();
      });
      chip.appendChild(text);
      chip.appendChild(removeBtn);
      taskDepartmentsList.appendChild(chip);
    });
  }

  function renderDetailsAttachments() {
    taskAttachmentsList.innerHTML = '';
    if (!detailsDraftAttachments.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhum link adicionado';
      taskAttachmentsList.appendChild(empty);
      return;
    }
    detailsDraftAttachments.forEach((attachment) => {
      const item = document.createElement('div');
      item.className = 'kanban-link-item';
      const safeUrl = getSafeHttpUrl(attachment.url);
      const isFileAttachment = /^file:/i.test(safeUrl);
      let actionNode;
      if (isFileAttachment) {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'kanban-link-anchor';
        openBtn.textContent = attachment.label;
        openBtn.addEventListener('click', () => {
          void openDraftAttachmentInNative(attachment);
        });
        actionNode = openBtn;
      } else {
        const anchor = document.createElement('a');
        anchor.className = 'kanban-link-anchor';
        anchor.href = safeUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = attachment.label;
        actionNode = anchor;
      }
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover link';
      removeBtn.addEventListener('click', () => {
        detailsDraftAttachments = detailsDraftAttachments.filter((itemCandidate) => itemCandidate.id !== attachment.id);
        renderDetailsAttachments();
      });
      item.appendChild(actionNode);
      item.appendChild(removeBtn);
      taskAttachmentsList.appendChild(item);
    });
  }

  function clearDetailsForm() {
    detailsTodoId = '';
    detailsDraftDepartments = [];
    detailsDraftTags = [];
    detailsDraftAttachments = [];
    taskTitleInput.value = '';
    taskPrioritySelect.value = 'med';
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = '';
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = '';
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
  }

  function openDetails(todoId) {
    const todo = getTodoById(todoId);
    if (!todo) return;
    detailsTodoId = todo.id;
    detailsDraftDepartments = getTodoDepartments(todo);
    detailsDraftTags = [...todo.tags];
    detailsDraftAttachments = todo.attachments.map((attachment) => ({ ...attachment }));
    taskTitleInput.value = todo.text;
    taskPrioritySelect.value = normalizePriority(todo.priority);
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = toInputDateValue(todo.dueAt);
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = todo.description || '';
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
    kanbanDetailsPanel.classList.add('is-open');
    kanbanDetailsPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetails() {
    kanbanDetailsPanel.classList.remove('is-open');
    kanbanDetailsPanel.setAttribute('aria-hidden', 'true');
    clearDetailsForm();
  }

  function addDraftTag() {
    if (!detailsTodoId) return;
    const tag = normalizeTag(taskTagInput.value);
    if (!tag) return;
    if (detailsDraftTags.some((value) => value.toLocaleLowerCase('pt-BR') === tag.toLocaleLowerCase('pt-BR'))) {
      taskTagInput.value = '';
      return;
    }
    if (detailsDraftTags.length >= 10) return;
    detailsDraftTags.push(tag);
    taskTagInput.value = '';
    taskTagInput.focus();
    renderDetailsTags();
  }

  function addDraftDepartment() {
    if (!detailsTodoId) return;
    const department = normalizeDepartment(taskDepartmentSelect.value);
    if (!department) return;
    if (detailsDraftDepartments.some((value) => normalizeSearchText(value) === normalizeSearchText(department))) {
      taskDepartmentSelect.value = '';
      return;
    }
    detailsDraftDepartments.push(department);
    taskDepartmentSelect.value = '';
    taskDepartmentSelect.focus();
    renderDetailsDepartments();
  }

  function addDraftAttachment() {
    if (!detailsTodoId) return;
    if (detailsDraftAttachments.length >= 10) return;
    const safeUrl = getSafeHttpUrl(taskAttachmentUrlInput.value);
    if (!safeUrl) return;
    const label = sanitizePlainText(taskAttachmentLabelInput.value, 40) || safeUrl;
    const id = sanitizePlainText(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 80);
    detailsDraftAttachments.push({
      id,
      label,
      url: safeUrl
    });
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskAttachmentLabelInput.focus();
    renderDetailsAttachments();
  }

  function requestNativeFileAttachment() {
    return new Promise((resolve) => {
      try {
        browserAPI.runtime.sendMessage({
          type: 'pickNativeFileAttachment',
          allowedExtensions: nativeAttachmentAllowedExtensions
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            resolve({
              ok: false,
              code: 'NATIVE_HOST_ERROR',
              message: String(browserAPI.runtime.lastError.message || 'native-host-indisponivel')
            });
            return;
          }
          resolve(response && typeof response === 'object'
            ? response
            : { ok: false, code: 'NATIVE_RESPONSE_INVALID', message: 'resposta-invalida' });
        });
      } catch (error) {
        resolve({
          ok: false,
          code: 'NATIVE_PICK_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-selecionar-arquivo')
        });
      }
    });
  }

  function requestOpenNativeFileAttachment(fileUrl) {
    return new Promise((resolve) => {
      try {
        browserAPI.runtime.sendMessage({
          type: 'openNativeFileAttachment',
          fileUrl,
          allowedExtensions: nativeAttachmentAllowedExtensions
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            resolve({
              ok: false,
              code: 'NATIVE_HOST_ERROR',
              message: String(browserAPI.runtime.lastError.message || 'native-host-indisponivel')
            });
            return;
          }
          resolve(response && typeof response === 'object'
            ? response
            : { ok: false, code: 'NATIVE_RESPONSE_INVALID', message: 'resposta-invalida' });
        });
      } catch (error) {
        resolve({
          ok: false,
          code: 'NATIVE_OPEN_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-abrir-arquivo')
        });
      }
    });
  }

  async function openDraftAttachmentInNative(attachment) {
    const safeUrl = getSafeHttpUrl(attachment && attachment.url);
    if (!safeUrl || !/^file:/i.test(safeUrl)) {
      alert('O anexo não possui um caminho de arquivo válido.');
      return;
    }
    const result = await requestOpenNativeFileAttachment(safeUrl);
    if (!result || !result.ok) {
      alert(`Não foi possível abrir o arquivo.${result && result.message ? `\n${result.message}` : ''}`);
    }
  }

  async function pickDraftAttachmentFromNative() {
    if (!detailsTodoId) return;
    if (detailsDraftAttachments.length >= 10) return;
    const result = await requestNativeFileAttachment();
    if (!result || !result.ok) {
      if (result && result.code === 'CANCELLED') return;
      alert(`Não foi possível selecionar o arquivo.${result && result.message ? `\n${result.message}` : ''}`);
      return;
    }
    const safeUrl = getSafeHttpUrl(result.fileUrl || '');
    if (!safeUrl) {
      alert('O arquivo selecionado não gerou um link válido.');
      return;
    }
    taskAttachmentLabelInput.value = sanitizePlainText(result.fileName || '', 40) || taskAttachmentLabelInput.value;
    taskAttachmentUrlInput.value = safeUrl;
    addDraftAttachment();
    if (!result.isNetworkPath) {
      alert('Arquivo local selecionado. O link pode não funcionar para outros usuários.');
    }
  }

  function normalizeServerBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (!/^https?:$/i.test(url.protocol)) return '';
      return `${url.protocol}//${url.host}`;
    } catch {
      return '';
    }
  }

  function getServerBaseUrlFromStorage() {
    return new Promise((resolve) => {
      browserAPI.storage.local.get(['serverUrl'], (result) => {
        resolve(normalizeServerBaseUrl(result && result.serverUrl));
      });
    });
  }

  function serializeTodoForSync(todo, override = {}) {
    const source = { ...(todo || {}), ...(override || {}) };
    const departments = normalizeDepartments(source.departments, source.department);
    const updatedAt = Number(source.updatedAt) || Date.now();
    return {
      id: sanitizePlainText(source.id || '', 80),
      title: sanitizePlainText(source.text || source.title || '', 200),
      description: sanitizePlainText(source.description || '', 2000),
      status: statuses.includes(source.status) ? source.status : 'todo',
      priority: normalizePriority(source.priority),
      due_at: normalizeDueAt(source.dueAt),
      tags: (Array.isArray(source.tags) ? source.tags : []).map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10),
      attachments: normalizeAttachments(source.attachments),
      departments,
      updated_at: updatedAt,
      created_at: Number(source.createdAt) || updatedAt,
      deleted: Number(source.deleted) ? 1 : 0
    };
  }

  function persistPendingChanges() {
    browserAPI.storage.local.set({ pendingChanges });
  }

  function queuePendingCardChange(payload) {
    if (!payload || !payload.id) return;
    const nextUpdatedAt = Number(payload.updated_at) || Date.now();
    const index = pendingChanges.findIndex((entry) => entry && entry.id === payload.id);
    if (index >= 0) {
      const currentUpdatedAt = Number(pendingChanges[index].updated_at) || 0;
      if (nextUpdatedAt >= currentUpdatedAt) {
        pendingChanges[index] = { ...payload, updated_at: nextUpdatedAt };
      }
    } else {
      pendingChanges.push({ ...payload, updated_at: nextUpdatedAt });
    }
    persistPendingChanges();
  }

  async function flushPendingChanges() {
    if (isSyncInProgress || !pendingChanges.length) return;
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) return;
    isSyncInProgress = true;
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/cards/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: pendingChanges })
      });
      if (!response.ok) return;
      pendingChanges = [];
      persistPendingChanges();
    } catch {
      return;
    } finally {
      isSyncInProgress = false;
    }
  }

  async function syncCardChange(todoPayload) {
    const payload = todoPayload && typeof todoPayload === 'object' ? todoPayload : null;
    if (!payload || !payload.id) return;
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) {
      queuePendingCardChange(payload);
      return;
    }
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        queuePendingCardChange(payload);
        return;
      }
      await flushPendingChanges();
    } catch {
      queuePendingCardChange(payload);
    }
  }

  function getWidgetDepartmentForSync() {
    const widgetDepartmentEl = document.getElementById('widgetTodosDepartment');
    return normalizeDepartment(widgetDepartmentEl && widgetDepartmentEl.textContent);
  }

  function getActiveDepartmentForSync() {
    return getWidgetDepartmentForSync() || normalizeDepartment(currentUserDepartment);
  }

  function isTodoInActiveDepartment(todo, activeDepartment = getActiveDepartmentForSync()) {
    const scopedDepartment = normalizeSearchText(activeDepartment);
    if (!scopedDepartment) return true;
    return getTodoDepartments(todo).some((department) => normalizeSearchText(department) === scopedDepartment);
  }

  async function refreshKanbanCardsFromServer() {
    await flushPendingChanges();
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) {
      return { ok: false, code: 'MISSING_SERVER_URL', message: 'Servidor não configurado.' };
    }
    const activeDepartment = getActiveDepartmentForSync();
    if (!activeDepartment) {
      return { ok: false, code: 'MISSING_DEPARTMENT', message: 'Departamento não definido para atualizar o Kanban.' };
    }
    const query = new URLSearchParams({ department: activeDepartment }).toString();
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/cards?${query}`, {
        method: 'GET'
      });
      if (!response.ok) {
        if (response.status === 400) {
          return { ok: false, code: 'INVALID_DEPARTMENT', message: 'Departamento inválido para buscar cards.' };
        }
        return { ok: false, code: 'REQUEST_FAILED', message: 'Falha ao consultar cards no servidor.' };
      }
      const data = await response.json();
      const cards = Array.isArray(data && data.cards) ? data.cards : [];
      const normalizedCards = normalizeTodoList(cards.map((card) => ({
        ...card,
        text: card.title || card.text || '',
        updatedAt: Number(card.updated_at ?? card.updatedAt) || Date.now(),
        deleted: Number(card.deleted) ? 1 : 0
      })));
      const targetDepartment = normalizeSearchText(activeDepartment);
      const serverMap = new Map(normalizedCards.map((card) => [card.id, card]));
      const localOutsideDepartment = todosState.filter((todo) => {
        return !getTodoDepartments(todo).some((department) => normalizeSearchText(department) === targetDepartment);
      });
      const merged = [...localOutsideDepartment];
      normalizedCards.forEach((card) => {
        const existing = merged.find((todo) => todo.id === card.id);
        if (!existing) {
          merged.push(card);
          return;
        }
        const existingUpdatedAt = Number(existing.updatedAt) || 0;
        const incomingUpdatedAt = Number(card.updatedAt) || 0;
        if (incomingUpdatedAt > existingUpdatedAt) {
          const index = merged.findIndex((todo) => todo.id === card.id);
          merged[index] = card;
        }
      });
      todosState = normalizeTodoList(merged);
      orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
      saveTodos(todosState);
      await flushPendingChanges();
      return { ok: true };
    } catch {
      return { ok: false, code: 'NETWORK_ERROR', message: 'Falha de conexão ao buscar cards.' };
    }
  }

  function saveDetails() {
    if (!detailsTodoId) return;
    const todo = getTodoById(detailsTodoId);
    if (!todo) {
      closeDetails();
      return;
    }
    const nextText = sanitizePlainText(taskTitleInput.value, 200);
    if (!nextText) {
      taskTitleInput.focus();
      return;
    }
    const nextPriority = normalizePriority(taskPrioritySelect.value);
    const nextDepartments = normalizeDepartments(detailsDraftDepartments);
    const nextDepartment = nextDepartments[0] || '';
    const nextDueAt = fromInputDateValue(taskDueDateInput.value);
    const nextDescription = sanitizePlainText(taskDescriptionInput.value, 2000);
    const nextTags = detailsDraftTags.map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10);
    const nextAttachments = normalizeAttachments(detailsDraftAttachments);
    const updatedAt = Date.now();
    let changedTodo = null;
    todosState = todosState.map((current) => (
      current.id === detailsTodoId
        ? {
            ...current,
            text: nextText,
            priority: nextPriority,
            departments: nextDepartments,
            department: nextDepartment,
            dueAt: nextDueAt,
            tags: nextTags,
            attachments: nextAttachments,
            description: nextDescription,
            updatedAt
          }
        : current
    ));
    changedTodo = todosState.find((current) => current.id === detailsTodoId) || null;
    const activeDepartment = getActiveDepartmentForSync();
    if (changedTodo && !isTodoInActiveDepartment(changedTodo, activeDepartment)) {
      todosState = todosState.filter((current) => current.id !== changedTodo.id);
      statuses.forEach((status) => {
        orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== changedTodo.id);
      });
    }
    saveTodos(todosState);
    if (changedTodo) {
      void syncCardChange(serializeTodoForSync(changedTodo));
    }
    closeDetails();
  }

  function matchesFilters(todo) {
    const departments = getTodoDepartments(todo);
    if (!isTodoInActiveDepartment(todo)) return false;
    const searchable = normalizeSearchText([
      todo.text,
      ...departments,
      todo.description,
      ...(Array.isArray(todo.tags) ? todo.tags : [])
    ].join(' '));
    if (todoSearchTerm && !searchable.includes(todoSearchTerm)) return false;
    if (priorityFilterValue !== 'all' && todo.priority !== priorityFilterValue) return false;
    if (
      departmentFilterTerm
      && !departments.some((department) => normalizeSearchText(department).includes(departmentFilterTerm))
    ) {
      return false;
    }
    if (
      tagFilterTerm
      && !todo.tags.some((tag) => normalizeSearchText(tag).includes(tagFilterTerm))
    ) {
      return false;
    }
    return true;
  }

  function getCardAfterElement(container, y) {
    const cards = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
    return cards.reduce((closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: card };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  function moveTodo(todoId, nextStatus) {
    if (!statuses.includes(nextStatus)) return;
    const movedTodo = getTodoById(todoId);
    if (!movedTodo) return;
    const updatedAt = Date.now();
    let hasChanged = false;
    todosState = todosState.map((todo) => {
      if (todo.id !== todoId) return todo;
      hasChanged = true;
      return {
        ...todo,
        status: nextStatus,
        completed: nextStatus === 'done',
        updatedAt
      };
    });
    if (!hasChanged) return;
    statuses.forEach((status) => {
      orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== todoId);
    });
    orderByStatusState[nextStatus].push(todoId);
    saveTodos(todosState);
    const nextTodo = getTodoById(todoId);
    if (nextTodo) {
      void syncCardChange(serializeTodoForSync(nextTodo));
    }
  }

  function createCard(todo) {
    const card = document.createElement('li');
    card.className = 'kanban-card';
    card.dataset.id = todo.id;
    card.setAttribute('draggable', hasActiveFilters() ? 'false' : 'true');

    card.addEventListener('dragstart', (event) => {
      if (hasActiveFilters()) {
        event.preventDefault();
        return;
      }
      draggingTodoId = todo.id;
      card.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', todo.id);
      }
    });
    card.addEventListener('dragend', () => {
      draggingTodoId = '';
      card.classList.remove('dragging');
      Object.values(listByStatus).forEach((list) => list.classList.remove('drag-over'));
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('a')) return;
      openDetails(todo.id);
    });

    const header = document.createElement('div');
    header.className = 'kanban-card-header';

    const text = document.createElement('div');
    text.className = 'kanban-card-text';
    text.textContent = todo.text;
    header.appendChild(text);

    const priorityBadge = document.createElement('span');
    priorityBadge.className = `kanban-priority-badge kanban-priority-${todo.priority}`;
    priorityBadge.textContent = priorityLabels[todo.priority] || priorityLabels.med;
    header.appendChild(priorityBadge);

    const submeta = document.createElement('div');
    submeta.className = 'kanban-card-submeta';
    getTodoDepartments(todo).forEach((departmentName) => {
      const department = document.createElement('span');
      department.textContent = departmentName;
      submeta.appendChild(department);
    });
    if (todo.dueAt > 0) {
      const due = document.createElement('span');
      const todayStart = getStartOfToday();
      const dueDateText = formatDueDate(todo.dueAt);
      due.textContent = `Prazo ${dueDateText}`;
      if (todo.dueAt < todayStart) {
        due.classList.add('kanban-due-overdue');
      } else if (isSameLocalDay(todo.dueAt, Date.now())) {
        due.classList.add('kanban-due-today');
      }
      submeta.appendChild(due);
    }

    const tagsRow = document.createElement('div');
    tagsRow.className = 'kanban-card-tags';
    (todo.tags || []).slice(0, 4).forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'kanban-tag-chip';
      chip.textContent = tag;
      tagsRow.appendChild(chip);
    });

    const indicators = document.createElement('div');
    indicators.className = 'kanban-card-indicators';
    if (todo.attachments.length) {
      const attachmentsCount = document.createElement('span');
      attachmentsCount.textContent = `🔗 ${todo.attachments.length}`;
      indicators.appendChild(attachmentsCount);
    }
    if (todo.description) {
      const descriptionBadge = document.createElement('span');
      descriptionBadge.textContent = '📝';
      indicators.appendChild(descriptionBadge);
    }

    const meta = document.createElement('div');
    meta.className = 'kanban-card-meta';

    const date = document.createElement('span');
    date.className = 'kanban-card-date';
    date.textContent = formatTodoDate(todo.createdAt);

    const actions = document.createElement('div');
    actions.className = 'kanban-card-actions';

    if (todo.status !== 'todo') {
      const previousBtn = document.createElement('button');
      previousBtn.type = 'button';
      previousBtn.className = 'kanban-card-btn';
      previousBtn.textContent = '←';
      previousBtn.title = 'Mover para etapa anterior';
      previousBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const previousStatus = todo.status === 'doing' ? 'todo' : 'doing';
        moveTodo(todo.id, previousStatus);
      });
      actions.appendChild(previousBtn);
    }

    if (todo.status !== 'done') {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'kanban-card-btn';
      nextBtn.textContent = '→';
      nextBtn.title = 'Mover para próxima etapa';
      nextBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const nextStatus = todo.status === 'todo' ? 'doing' : 'done';
        moveTodo(todo.id, nextStatus);
      });
      actions.appendChild(nextBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'kanban-card-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Excluir tarefa';
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const deletedPayload = serializeTodoForSync(todo, { deleted: 1, updatedAt: Date.now() });
      todosState = todosState.filter((current) => current.id !== todo.id);
      statuses.forEach((status) => {
        orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== todo.id);
      });
      if (detailsTodoId === todo.id) closeDetails();
      saveTodos(todosState);
      void syncCardChange(deletedPayload);
    });
    actions.appendChild(deleteBtn);

    meta.appendChild(date);
    meta.appendChild(actions);
    card.appendChild(header);
    if (submeta.childElementCount > 0) card.appendChild(submeta);
    if (tagsRow.childElementCount > 0) card.appendChild(tagsRow);
    if (indicators.childElementCount > 0) card.appendChild(indicators);
    card.appendChild(meta);
    return card;
  }

  function renderStatusColumn(status) {
    const list = listByStatus[status];
    list.innerHTML = '';
    const orderedTodos = getSortedTodosForStatus(status);
    const filteredTodos = orderedTodos.filter((todo) => matchesFilters(todo));
    if (!filteredTodos.length) {
      const empty = document.createElement('li');
      empty.className = 'kanban-empty';
      empty.textContent = hasActiveFilters() ? 'Nenhuma tarefa encontrada' : 'Sem tarefas nesta etapa';
      list.appendChild(empty);
      return;
    }
    filteredTodos.forEach((todo) => {
      list.appendChild(createCard(todo));
    });
  }

  function renderTodos() {
    syncStatusAndOrder();
    renderStatusColumn('todo');
    renderStatusColumn('doing');
    renderStatusColumn('done');
    updateSummary();
    updateToggleAllButton();
  }

  function saveTodos(todos) {
    todosState = normalizeTodoList(todos);
    syncStatusAndOrder();
    browserAPI.storage.local.set({
      userTodos: todosState,
      kanbanOrderByStatus: orderByStatusState
    });
    renderTodos();
  }

  function loadTodos() {
    browserAPI.storage.local.get(['userTodos', 'kanbanOrderByStatus', 'browserDepartment', 'pendingChanges'], (result) => {
      todosState = normalizeTodoList(result.userTodos || []);
      orderByStatusState = normalizeOrderByStatus(result.kanbanOrderByStatus, todosState);
      currentUserDepartment = normalizeDepartment(result.browserDepartment || '');
      pendingChanges = Array.isArray(result.pendingChanges)
        ? result.pendingChanges.filter((entry) => entry && entry.id)
        : [];
      renderTodos();
      void flushPendingChanges();
      void refreshKanbanCardsFromServer();
    });
  }

  function persistOrderFromDom(targetStatus) {
    const list = listByStatus[targetStatus];
    const cardIds = [...list.querySelectorAll('.kanban-card')].map((card) => card.dataset.id).filter(Boolean);
    statuses.forEach((status) => {
      orderByStatusState[status] = orderByStatusState[status].filter((id) => !cardIds.includes(id));
    });
    orderByStatusState[targetStatus] = cardIds;
  }

  function openKanban() {
    kanbanOverlay.classList.add('is-open');
    kanbanOverlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    todoInput.focus();
  }

  function closeKanban() {
    if (isKanbanPageMode) {
      window.location.href = browserAPI.runtime.getURL('intranet.html');
      return;
    }
    closeDetails();
    kanbanOverlay.classList.remove('is-open');
    kanbanOverlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  statuses.forEach((status) => {
    const list = listByStatus[status];
    list.addEventListener('dragover', (event) => {
      if (hasActiveFilters() || !draggingTodoId) return;
      event.preventDefault();
      list.classList.add('drag-over');
      const draggingCard = document.querySelector('.kanban-card.dragging');
      if (!draggingCard) return;
      const afterElement = getCardAfterElement(list, event.clientY);
      if (!afterElement) {
        list.appendChild(draggingCard);
      } else {
        list.insertBefore(draggingCard, afterElement);
      }
    });
    list.addEventListener('dragleave', () => {
      list.classList.remove('drag-over');
    });
    list.addEventListener('drop', (event) => {
      if (hasActiveFilters() || !draggingTodoId) return;
      event.preventDefault();
      list.classList.remove('drag-over');
      const todoId = sanitizePlainText(draggingTodoId, 80);
      if (!todoId) return;
      const movedTodo = getTodoById(todoId);
      if (!movedTodo) return;
      const updatedAt = Date.now();
      todosState = todosState.map((todo) => (
        todo.id === todoId ? { ...todo, status, completed: status === 'done', updatedAt } : todo
      ));
      persistOrderFromDom(status);
      saveTodos(todosState);
      const nextTodo = getTodoById(todoId);
      if (nextTodo) {
        void syncCardChange(serializeTodoForSync(nextTodo));
      }
    });
  });

  openKanbanBtn.addEventListener('click', openKanban);
  closeKanbanBtn.addEventListener('click', closeKanban);
  closeKanbanDetailsBtn.addEventListener('click', closeDetails);
  cancelTaskDetailsBtn.addEventListener('click', closeDetails);
  saveTaskDetailsBtn.addEventListener('click', saveDetails);
  if (refreshKanbanSnapshotBtns.length) {
    const handleKanbanRefreshClick = async () => {
      const activeBtn = refreshKanbanSnapshotBtns.find((btn) => btn && !btn.disabled);
      if (!activeBtn) return;
      const originalLabels = refreshKanbanSnapshotBtns.map((btn) => btn.textContent);
      refreshKanbanSnapshotBtns.forEach((btn) => {
        btn.disabled = true;
        btn.textContent = '...';
      });
      const result = await refreshKanbanCardsFromServer();
      refreshKanbanSnapshotBtns.forEach((btn, index) => {
        btn.disabled = false;
        btn.textContent = originalLabels[index];
      });
      if (!result || !result.ok) {
        alert(`Não foi possível atualizar o Kanban.${result && result.message ? `\n${result.message}` : ''}`);
      }
    };
    refreshKanbanSnapshotBtns.forEach((btn) => {
      btn.addEventListener('click', handleKanbanRefreshClick);
    });
  }
  addTaskTagBtn.addEventListener('click', addDraftTag);
  addTaskDepartmentBtn.addEventListener('click', addDraftDepartment);
  taskDepartmentSelect.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftDepartment();
    }
  });
  taskTagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftTag();
    }
  });
  pickTaskAttachmentFileBtn.addEventListener('click', () => {
    void pickDraftAttachmentFromNative();
  });
  addTaskAttachmentBtn.addEventListener('click', addDraftAttachment);
  taskAttachmentUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftAttachment();
    }
  });
  kanbanOverlay.addEventListener('click', (event) => {
    if (event.target === kanbanOverlay) closeKanban();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !kanbanOverlay.classList.contains('is-open')) return;
    if (kanbanDetailsPanel.classList.contains('is-open')) {
      closeDetails();
      return;
    }
    closeKanban();
  });

  todoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = sanitizePlainText(todoInput.value, 200);
    if (!text) return;
    const createdAt = Date.now();
    const id = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const activeDepartment = getActiveDepartmentForSync();
    const departments = activeDepartment ? [activeDepartment] : [];
    todosState = [
      ...todosState,
      {
        id,
        text,
        completed: false,
        createdAt,
        updatedAt: createdAt,
        status: 'todo',
        priority: 'med',
        departments,
        department: departments[0] || '',
        dueAt: 0,
        tags: [],
        attachments: [],
        description: ''
      }
    ];
    orderByStatusState.todo.push(id);
    saveTodos(todosState);
    const nextTodo = getTodoById(id);
    if (nextTodo) {
      void syncCardChange(serializeTodoForSync(nextTodo));
    }
    todoInput.value = '';
    todoInput.focus();
  });

  clearBtn.addEventListener('click', () => {
    const removedDoneTodos = todosState.filter((todo) => todo.status === 'done');
    const tombstones = removedDoneTodos.map((todo) => serializeTodoForSync(todo, { deleted: 1, updatedAt: Date.now() }));
    todosState = todosState.filter((todo) => todo.status !== 'done');
    orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
    saveTodos(todosState);
    tombstones.forEach((payload) => {
      void syncCardChange(payload);
    });
  });

  toggleAllBtn.addEventListener('click', () => {
    if (!todosState.length) return;
    const shouldComplete = !todosState.every((todo) => todo.status === 'done');
    const nextStatus = shouldComplete ? 'done' : 'todo';
    todosState = todosState.map((todo) => ({
      ...todo,
      status: nextStatus,
      completed: nextStatus === 'done',
      updatedAt: Date.now()
    }));
    orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
    saveTodos(todosState);
    todosState.forEach((todo) => {
      void syncCardChange(serializeTodoForSync(todo));
    });
  });

  todoSearchInput.addEventListener('input', (event) => {
    todoSearchTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  priorityFilterInput.addEventListener('change', (event) => {
    const value = sanitizePlainText(event.target && event.target.value, 20).toLowerCase();
    priorityFilterValue = value === 'all' || priorityOptions.includes(value) ? value : 'all';
    renderTodos();
  });
  departmentFilterInput.addEventListener('input', (event) => {
    departmentFilterTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  tagFilterInput.addEventListener('input', (event) => {
    tagFilterTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });

  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.browserDepartment) return;
    currentUserDepartment = normalizeDepartment(changes.browserDepartment.newValue || '');
    updateSummary();
  });

  window.__organifeSetTodosFromImport = (todos) => {
    todosState = normalizeTodoList(Array.isArray(todos) ? todos : []);
    orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
    saveTodos(todosState);
  };

  closeDetails();
  loadTodos();
  if (isKanbanPageMode) {
    openKanban();
  }
}

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.browserUser) {
    const nextUser = String(changes.browserUser.newValue || '').trim();
    if (!nextUser) {
      redirectToIdentity();
      return;
    }
  }
  
  if (changes.companyName || changes.quickLinks || changes.browserUser || changes.browserDepartment) {
    loadPageData();
  }
  if (changes.companyNotice) {
    loadNotice();
  }
  if (changes.releaseRequests) {
    loadRequests();
  }
  if (changes.themeMode) {
    applyTheme(changes.themeMode.newValue);
  }
  if (changes.serverUrl) {
    updateConnectionStatus();
  }
});

// --- Drag and Drop Logic ---
function initDragAndDrop() {
  const columnLeft = document.getElementById('columnLeft');
  const columnRight = document.getElementById('columnRight');
  const columns = [columnLeft, columnRight].filter(Boolean);
  const draggables = Array.from(document.querySelectorAll('.card.widget-draggable'));
  const dragHandles = Array.from(document.querySelectorAll('.drag-handle'));
  if (!columns.length || !draggables.length || !dragHandles.length) return;

  draggables.forEach((draggable) => {
    draggable.setAttribute('draggable', 'false');
    draggable.dataset.dragReady = 'false';

    draggable.addEventListener('dragstart', (event) => {
      if (draggable.dataset.dragReady !== 'true') {
        event.preventDefault();
        return;
      }
      draggable.classList.add('dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggable.id);
      }
    });

    draggable.addEventListener('dragend', () => {
      draggable.classList.remove('dragging');
      draggable.dataset.dragReady = 'false';
      draggable.setAttribute('draggable', 'false');
      saveWidgetOrder();
    });
  });

  dragHandles.forEach((handle) => {
    const draggable = handle.closest('.card.widget-draggable');
    if (!draggable) return;
    handle.addEventListener('pointerdown', () => {
      draggable.dataset.dragReady = 'true';
      draggable.setAttribute('draggable', 'true');
    });
  });

  document.addEventListener('pointerup', () => {
    draggables.forEach((draggable) => {
      if (!draggable.classList.contains('dragging')) {
        draggable.dataset.dragReady = 'false';
        draggable.setAttribute('draggable', 'false');
      }
    });
  });

  columns.forEach((column) => {
    column.addEventListener('dragover', (event) => {
      const draggable = document.querySelector('.card.dragging');
      if (!draggable || draggable.parentElement !== column) return;
      event.preventDefault();
      const afterElement = getDragAfterElement(column, event.clientY);
      if (afterElement == null) {
        column.appendChild(draggable);
      } else {
        column.insertBefore(draggable, afterElement);
      }
    });
  });

  browserAPI.storage.local.get(['widgetOrderByColumn', 'widgetOrder'], (result) => {
    if (result.widgetOrderByColumn && typeof result.widgetOrderByColumn === 'object') {
      applySavedOrder(result.widgetOrderByColumn);
      return;
    }
    if (Array.isArray(result.widgetOrder) && result.widgetOrder.length) {
      applySavedOrder({ columnRight: result.widgetOrder });
    }
  });

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.card.widget-draggable:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function applySavedOrder(orderByColumn) {
    columns.forEach((column) => {
      const ids = Array.isArray(orderByColumn[column.id]) ? orderByColumn[column.id] : [];
      ids.forEach((id) => {
        const element = document.getElementById(id);
        if (element && element.parentElement === column && element.classList.contains('widget-draggable')) {
          column.appendChild(element);
        }
      });
    });
  }

  function saveWidgetOrder() {
    const currentOrder = {};
    columns.forEach((column) => {
      currentOrder[column.id] = [...column.querySelectorAll('.card.widget-draggable')].map((el) => el.id);
    });
    browserAPI.storage.local.set({
      widgetOrderByColumn: currentOrder,
      widgetOrder: currentOrder.columnRight || []
    });
  }
}
