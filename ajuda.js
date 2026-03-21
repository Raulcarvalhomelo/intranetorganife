const THEME_STORAGE_KEY = 'themeMode';

function normalizeThemeMode(value) {
  return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

function getStorageGet() {
  const hasBrowserApi = typeof browser !== 'undefined' || typeof chrome !== 'undefined';
  const browserAPI = hasBrowserApi ? (typeof browser !== 'undefined' ? browser : chrome) : null;
  if (browserAPI && browserAPI.storage && browserAPI.storage.local && typeof browserAPI.storage.local.get === 'function') {
    return (key, callback) => browserAPI.storage.local.get([key], (result) => callback(result ? result[key] : undefined));
  }
  return (key, callback) => callback(window.localStorage.getItem(key));
}

function getStorageSet() {
  const hasBrowserApi = typeof browser !== 'undefined' || typeof chrome !== 'undefined';
  const browserAPI = hasBrowserApi ? (typeof browser !== 'undefined' ? browser : chrome) : null;
  if (browserAPI && browserAPI.storage && browserAPI.storage.local && typeof browserAPI.storage.local.set === 'function') {
    return (key, value) => browserAPI.storage.local.set({ [key]: value });
  }
  return (key, value) => window.localStorage.setItem(key, value);
}

const storageGet = getStorageGet();
const storageSet = getStorageSet();

function updateThemeButtonLabel(mode) {
  const themeToggle = document.getElementById('themeToggleHelp');
  if (!themeToggle) return;
  themeToggle.textContent = mode === 'dark' ? 'Light' : 'Dark';
}

function applyTheme(mode) {
  const normalized = normalizeThemeMode(mode);
  document.body.setAttribute('data-theme', normalized);
  updateThemeButtonLabel(normalized);
}

function activatePanel(panelId) {
  const panels = Array.from(document.querySelectorAll('.panel'));
  const menuButtons = Array.from(document.querySelectorAll('.menu-btn'));
  let nextTitle = '';

  panels.forEach((panel) => {
    const isTarget = panel.id === panelId;
    panel.classList.toggle('active', isTarget);
    if (isTarget) nextTitle = panel.getAttribute('data-title') || '';
  });

  menuButtons.forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-target') === panelId);
  });

  const contentTitle = document.getElementById('contentTitle');
  if (contentTitle && nextTitle) contentTitle.textContent = nextTitle;
}

function initTabs() {
  const menu = document.getElementById('helpMenu');
  if (!menu) return;
  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.menu-btn');
    if (!button) return;
    const panelId = button.getAttribute('data-target');
    if (!panelId) return;
    activatePanel(panelId);
  });
}

function initTheme() {
  storageGet(THEME_STORAGE_KEY, (saved) => {
    applyTheme(saved);
  });

  const themeToggle = document.getElementById('themeToggleHelp');
  if (!themeToggle) return;
  themeToggle.addEventListener('click', () => {
    const current = normalizeThemeMode(document.body.getAttribute('data-theme'));
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storageSet(THEME_STORAGE_KEY, next);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
});
