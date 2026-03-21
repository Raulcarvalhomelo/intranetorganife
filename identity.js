const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

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

function saveUserName() {
  const input = document.getElementById('userName');
  const departmentSelect = document.getElementById('userDepartment');
  const error = document.getElementById('error');
  const name = String(input.value || '').trim();
  const department = String(departmentSelect && departmentSelect.value || '').trim();
  if (!name || !department) {
    error.classList.add('show');
    if (!name) {
      input.focus();
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
    if (existing) {
      input.value = existing;
    }
    if (existingDepartment) {
      departmentSelect.value = existingDepartment;
    }
    input.focus();
  });

  saveButton.addEventListener('click', saveUserName);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
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
