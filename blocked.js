// Browser compatibility layer
const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);
const redirectDelaySeconds = 5;
let submitInFlight = false;

function parseDomainValue(input) {
  try {
    return new URL(String(input || '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return String(input || '').toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  }
}

function domainMatches(domain, pattern) {
  const host = parseDomainValue(domain);
  const p = String(pattern || '').trim().toLowerCase();
  if (!host || !p) return false;
  if (p === '*') return true;
  if (p.startsWith('*.')) {
    const suffix = p.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  const normalizedPattern = p.replace(/^www\./, '');
  if (!normalizedPattern.includes('*')) return host === normalizedPattern;
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(host);
}

function linkExistsInKeywords(url, domain, blockedKeywords) {
  const haystack = `${String(url || '').toLowerCase()} ${String(domain || '').toLowerCase()}`;
  return (Array.isArray(blockedKeywords) ? blockedKeywords : []).some((keyword) => {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    return normalizedKeyword && haystack.includes(normalizedKeyword);
  });
}

function findRequestForDomain(requests, domain) {
  return (Array.isArray(requests) ? requests : []).find((item) => {
    const requestDomain = String((item && (item.domain || item.originalUrl)) || '').trim();
    return domainMatches(domain, requestDomain) || domainMatches(requestDomain, domain);
  });
}

function unlockSubmit() {
  submitInFlight = false;
  const submitButton = document.getElementById('submitRequest');
  if (submitButton) submitButton.disabled = false;
}

function showRequestSuccess(blockedUrl) {
  document.getElementById('requestForm').classList.add('hidden');
  document.getElementById('successMessage').classList.add('show');
  startRedirectCountdown(blockedUrl);
}

// Get the blocked URL strictly from the 'url' query param only.
// We never use window.location.href or document.referrer to avoid
// the infinite encoding loop where the blocked page URL itself gets stored.
function getBlockedUrl() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const raw = urlParams.get('url');
    if (!raw) return 'URL desconhecida';
    // Decode exactly once — the background already encoded it once with encodeURIComponent
    return decodeURIComponent(raw);
  } catch {
    return 'URL desconhecida';
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return `*.${urlObj.hostname.replace(/^www\./, '')}`;
  } catch {
    return url;
  }
}

// Get only the hostname/domain from a URL string
function getDisplayDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function startRedirectCountdown(url) {
  if (!url || url === 'URL desconhecida') return;
  let remaining = redirectDelaySeconds;
  const countdownEl = document.getElementById('redirectCountdown');
  if (countdownEl) countdownEl.textContent = String(remaining);
  const intervalId = setInterval(() => {
    remaining -= 1;
    if (countdownEl) countdownEl.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(intervalId);
      window.location.href = url;
    }
  }, 1000);
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  const blockedUrl = getBlockedUrl();
  
  // Display only the domain — not the full raw URL — to avoid the encoding mess
  document.getElementById('blockedUrl').textContent = getDisplayDomain(blockedUrl);
  
  // Check block mode
  browserAPI.storage.local.get(['totalBlockMode'], (result) => {
    const badge = document.getElementById('blockModeBadge');
    const reason = document.getElementById('blockReason');
    
    if (result.totalBlockMode) {
      badge.textContent = 'Bloqueio total ativado';
      reason.textContent = 'all';
    } else {
      badge.textContent = 'Site na lista de bloqueio';
      reason.textContent = 'site bloqueado';
    }
  });

  // Handle back link
  document.getElementById('backLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.history.back();
  });

  // Handle form submission
  document.getElementById('submitRequest').addEventListener('click', handleSubmitRequest);
  
  // Allow Enter to submit
  document.getElementById('requestReason').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmitRequest();
    }
  });
});

// Handle release request submission
function handleSubmitRequest() {
  if (submitInFlight) return;
  const reason = document.getElementById('requestReason').value.trim();
  
  if (!reason) {
    alert('Por favor, informe o motivo da solicitacao.');
    return;
  }
  submitInFlight = true;
  const submitButton = document.getElementById('submitRequest');
  if (submitButton) submitButton.disabled = true;

  const blockedUrl = getBlockedUrl();
  const domain = extractDomain(blockedUrl);
  
  const request = {
    clientRequestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    domain: domain,
    originalUrl: blockedUrl,
    reason: reason,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  browserAPI.storage.local.get(['browserUser', 'releaseRequests', 'tempAllowedLinks', 'blockedSites', 'blockedKeywords'], (result) => {
    request.user = result.browserUser || 'Desconhecido';
    const requests = Array.isArray(result.releaseRequests) ? result.releaseRequests : [];
    const tempAllowedLinks = Array.isArray(result.tempAllowedLinks) ? result.tempAllowedLinks : [];
    const blockedSites = Array.isArray(result.blockedSites) ? result.blockedSites : [];
    const blockedKeywords = Array.isArray(result.blockedKeywords) ? result.blockedKeywords : [];
    const normalizedDomain = String(domain || '').toLowerCase().trim();
    const inTempAllowedLinks = tempAllowedLinks.some((entry) => domainMatches(normalizedDomain, entry) || domainMatches(entry, normalizedDomain));
    const inBlockedSites = blockedSites.some((entry) => domainMatches(normalizedDomain, entry) || domainMatches(entry, normalizedDomain));
    const inBlockedKeywords = linkExistsInKeywords(blockedUrl, normalizedDomain, blockedKeywords);
    const existingRequest = findRequestForDomain(requests, normalizedDomain);

    if (existingRequest) {
      showRequestSuccess(blockedUrl);
      return;
    }
    if (inTempAllowedLinks || inBlockedSites || inBlockedKeywords) {
      unlockSubmit();
      alert('link registrado nas listas de controle.');
      return;
    }

    requests.push(request);
    if (!tempAllowedLinks.includes(domain)) {
      tempAllowedLinks.push(domain);
    }

    browserAPI.storage.local.set({ releaseRequests: requests, tempAllowedLinks }, () => {
      showRequestSuccess(blockedUrl);
      browserAPI.runtime.sendMessage({
        type: 'newReleaseRequest',
        request: request
      });
    });
  });
}
