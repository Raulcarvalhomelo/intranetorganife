const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);
let resolvedUserName = '';
let isManualUserMode = false;

function getNextUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const next = String(params.get('next') || '').trim();
    if (!next) return '';
    if (next.startsWith(browserAPI.runtime.getURL(''))) return '';
    return next;
  } catch {
    return '';
  }
}

function setManualUserMode(enabled, input, valueContainer) {
  isManualUserMode = !!enabled;
  if (isManualUserMode) {
    input.classList.remove('hidden');
    valueContainer.classList.add('hidden');
    input.focus();
    return;
  }
  input.classList.add('hidden');
  valueContainer.classList.remove('hidden');
}

function resolveWindowsUser() {
  return new Promise((resolve) => {
    try {
      browserAPI.runtime.sendMessage({ type: 'getWindowsUser' }, (response) => {
        if (browserAPI.runtime.lastError) {
          resolve({ ok: false, code: 'WINDOWS_USER_ERROR', message: String(browserAPI.runtime.lastError.message || 'native-host-indisponivel') });
          return;
        }
        if (!response || typeof response !== 'object') {
          resolve({ ok: false, code: 'WINDOWS_USER_INVALID', message: 'resposta-invalida' });
          return;
        }
        resolve(response);
      });
    } catch (error) {
      resolve({ ok: false, code: 'WINDOWS_USER_EXCEPTION', message: String(error && error.message ? error.message : 'falha-ao-obter-usuario-windows') });
    }
  });
}

function getUserNameForSave(input, valueContainer) {
  if (isManualUserMode) {
    return String(input.value || '').trim();
  }
  const resolved = String(resolvedUserName || '').trim();
  if (resolved) return resolved;
  return String(valueContainer.textContent || '').trim();
}

function saveUserName() {
  const input = document.getElementById('userName');
  const valueContainer = document.getElementById('userNameValue');
  const departmentSelect = document.getElementById('userDepartment');
  const error = document.getElementById('error');
  const name = getUserNameForSave(input, valueContainer);
  const department = String(departmentSelect && departmentSelect.value || '').trim();
  if (!name || !department) {
    error.classList.add('show');
    if (!name) {
      if (isManualUserMode) {
        input.focus();
      }
      return;
    }
    departmentSelect.focus();
    return;
  }
  browserAPI.storage.local.set({ browserUser: name, browserDepartment: department }, () => {
    const next = getNextUrl();
    if (next) {
      window.location.href = next;
      return;
    }
    window.close();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('userName');
  const valueContainer = document.getElementById('userNameValue');
  const departmentSelect = document.getElementById('userDepartment');
  const saveButton = document.getElementById('saveUser');
  const error = document.getElementById('error');

  browserAPI.storage.local.get(['browserUser', 'browserDepartment'], (result) => {
    const existing = String(result.browserUser || '').trim();
    const existingDepartment = String(result.browserDepartment || '').trim();
    if (existing && existingDepartment) {
      const next = getNextUrl();
      if (next) {
        window.location.href = next;
        return;
      }
      window.close();
      return;
    }
    if (existingDepartment) {
      departmentSelect.value = existingDepartment;
    }
    const storedName = String(existing || '').trim();
    resolveWindowsUser().then((nativeResult) => {
      const nativeUserName = String((nativeResult && (nativeResult.userName || nativeResult.username)) || '').trim();
      const nativeDisplayName = String((nativeResult && (nativeResult.displayName || nativeUserName)) || '').trim();
      if (nativeResult && nativeResult.ok && nativeUserName) {
        resolvedUserName = nativeUserName;
        valueContainer.textContent = nativeDisplayName || nativeUserName;
        setManualUserMode(false, input, valueContainer);
        departmentSelect.focus();
        return;
      }
      resolvedUserName = '';
      if (storedName) {
        input.value = storedName;
      }
      valueContainer.textContent = 'Não foi possível carregar automaticamente.';
      setManualUserMode(true, input, valueContainer);
    });
  });

  saveButton.addEventListener('click', saveUserName);
  input.addEventListener('keydown', (event) => {
    if (isManualUserMode && event.key === 'Enter') {
      event.preventDefault();
      saveUserName();
    }
  });
  input.addEventListener('input', () => {
    if (String(input.value || '').trim()) {
      error.classList.remove('show');
    }
  });
  departmentSelect.addEventListener('change', () => {
    if (String(departmentSelect.value || '').trim()) {
      error.classList.remove('show');
    }
  });
});
