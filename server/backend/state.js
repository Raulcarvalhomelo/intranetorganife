'use strict';

const fs = require('fs');
const path = require('path');

const defaultState = {
  auth: {
    dashboardPassword: '',
    dashboardViewerPassword: ''
  },
  settings: {
    adminPassword: 'admin',
    restrictedPassword: '',
    tempPassword: '',
    companyName: 'Organife',
    companyNotice: '',
    serverUrl: 'http://192.168.100.34:1337',
    quickLinks: [
      { name: 'Intranet', url: 'https://intranet.empresa.com' },
      { name: 'Email', url: 'https://mail.empresa.com' },
      { name: 'Suporte TI', url: 'https://suporte.empresa.com' }
    ],
    blockedKeywords: [],
    blockedSites: [],
    allowedLinks: [],
    allowedDomains: [],
    tempAllowedLinks: [],
    totalBlockMode: false,
    browserUser: ''
  },
  releaseRequests: [],
  logs: []
};

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function createStateStore(options) {
  const config = options || {};
  const dataDir = path.resolve(String(config.dataDir || process.env.ORGANIFE_DATABASE_DIR || path.join(__dirname, '../database')));
  const dataFile = path.resolve(String(config.dataFile || path.join(dataDir, 'runtime-state.json')));
  const extensionAdminPasswordDefault = String(config.extensionAdminPasswordDefault || process.env.EXTENSION_ADMIN_PASSWORD || defaultState.settings.adminPassword).trim() || defaultState.settings.adminPassword;

  function ensure() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dataFile)) {
      const initialState = cloneDefaultState();
      initialState.settings.adminPassword = extensionAdminPasswordDefault;
      fs.writeFileSync(dataFile, JSON.stringify(initialState, null, 2), 'utf8');
    }
  }

  function read() {
    ensure();
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      const parsed = JSON.parse(raw);
      const settings = Object.assign({}, defaultState.settings, parsed.settings || {});
      if (!String(settings.adminPassword || '').trim()) settings.adminPassword = extensionAdminPasswordDefault;
      return {
        auth: Object.assign({}, defaultState.auth, parsed.auth || {}),
        settings,
        releaseRequests: Array.isArray(parsed.releaseRequests) ? parsed.releaseRequests : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
    } catch (error) {
      return cloneDefaultState();
    }
  }

  function write(state) {
    ensure();
    const current = state && typeof state === 'object' ? state : {};
    const settings = current.settings && typeof current.settings === 'object' ? Object.assign({}, current.settings) : Object.assign({}, defaultState.settings);
    if (!String(settings.adminPassword || '').trim()) settings.adminPassword = extensionAdminPasswordDefault;
    const nextState = {
      auth: current.auth && typeof current.auth === 'object' ? current.auth : defaultState.auth,
      settings,
      releaseRequests: Array.isArray(current.releaseRequests) ? current.releaseRequests : [],
      logs: []
    };
    const tempFile = `${dataFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(nextState, null, 2), 'utf8');
    fs.renameSync(tempFile, dataFile);
  }

  return { dataDir, dataFile, ensure, read, write };
}

const defaultStore = createStateStore();

module.exports = {
  createStateStore,
  defaults: defaultState,
  ensure: defaultStore.ensure,
  read: defaultStore.read,
  write: defaultStore.write
};
