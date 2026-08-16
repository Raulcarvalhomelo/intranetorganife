'use strict';

function createIdentityService(options) {
  const config = options || {};
  const browserAPI = config.browserAPI;
  const nativeHostName = String(config.nativeHostName || 'com.organife.filepicker');
  let cachedWindowsUser = '';
  let resolved = false;
  let resolving = null;

  function storageGet(keys) {
    return new Promise((resolve) => {
      if (!browserAPI || !browserAPI.storage || !browserAPI.storage.local) {
        resolve({});
        return;
      }
      browserAPI.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  function getBrowserName() {
    const userAgent = String(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (/Edg\//i.test(userAgent)) return 'Edge';
    if (/Firefox\//i.test(userAgent)) return 'Firefox';
    if (/Chrome\//i.test(userAgent)) return 'Chrome';
    return 'Navegador';
  }

  function getNativeUser() {
    return new Promise((resolve) => {
      if (!browserAPI || !browserAPI.runtime || typeof browserAPI.runtime.sendNativeMessage !== 'function') {
        resolve({ ok: false, code: 'NATIVE_MESSAGING_UNAVAILABLE' });
        return;
      }
      try {
        browserAPI.runtime.sendNativeMessage(nativeHostName, { action: 'getWindowsUser' }, (response) => {
          if (browserAPI.runtime.lastError || !response || typeof response !== 'object') {
            resolve({ ok: false, code: 'NATIVE_HOST_ERROR' });
            return;
          }
          resolve(response);
        });
      } catch (error) {
        resolve({ ok: false, code: 'NATIVE_HOST_EXCEPTION' });
      }
    });
  }

  async function getWindowsUser() {
    if (resolved) return cachedWindowsUser || 'unknown-user';
    if (!resolving) {
      resolving = getNativeUser().then(async (result) => {
        if (result && result.ok) cachedWindowsUser = String(result.displayName || result.userName || result.username || '').trim();
        if (!cachedWindowsUser) {
          const stored = await storageGet(['windowsUser', 'browserUser']);
          cachedWindowsUser = String(stored.windowsUser || stored.browserUser || '').trim();
        }
        resolved = true;
        resolving = null;
        return cachedWindowsUser || 'unknown-user';
      });
    }
    return resolving;
  }

  return { getBrowserName, getWindowsUser, storageGet };
}

if (typeof globalThis !== 'undefined') globalThis.OrganifeIdentity = { createIdentityService };
if (typeof module !== 'undefined') module.exports = { createIdentityService };
