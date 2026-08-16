'use strict';

function createTracker(options) {
  const config = options || {};
  const browserAPI = config.browserAPI;
  const log = typeof config.log === 'function' ? config.log : function () {};
  const shouldBlock = typeof config.shouldBlock === 'function' ? config.shouldBlock : function () { return false; };
  const onBlocked = typeof config.onBlocked === 'function' ? config.onBlocked : function () {};

  function handleNavigation(details) {
    const tabId = Number(details && details.tabId);
    const url = String(details && details.url || '');
    if (shouldBlock(url)) {
      log('blocked', { url });
      onBlocked(tabId, url);
      return true;
    }
    log('navigation', { url, tabId });
    return false;
  }

  function handleDownload(item) {
    log('download', {
      id: item && item.id,
      url: String(item && (item.finalUrl || item.url) || ''),
      filename: String(item && item.filename || '')
    });
  }

  function handleIdle(state) {
    log('idle', { state: String(state || '') });
  }

  function register() {
    if (!browserAPI) return;
    if (browserAPI.webNavigation && browserAPI.webNavigation.onCommitted) browserAPI.webNavigation.onCommitted.addListener(handleNavigation);
    if (browserAPI.downloads && browserAPI.downloads.onCreated) browserAPI.downloads.onCreated.addListener(handleDownload);
    if (browserAPI.idle && browserAPI.idle.onStateChanged) browserAPI.idle.onStateChanged.addListener(handleIdle);
  }

  return { register, handleNavigation, handleDownload, handleIdle };
}

if (typeof globalThis !== 'undefined') globalThis.OrganifeTracker = { createTracker };
if (typeof module !== 'undefined') module.exports = { createTracker };
