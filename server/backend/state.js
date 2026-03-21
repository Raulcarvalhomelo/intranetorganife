const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../database');
const dataFile = path.join(dataDir, 'runtime-state.json');

const defaults = {
  auth: {
    dashboardPassword: ''
  },
  settings: {
    adminPassword: '',
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

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(defaults, null, 2), 'utf8');
}

function read() {
  ensure();
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      auth: { ...defaults.auth, ...(parsed.auth || {}) },
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      releaseRequests: Array.isArray(parsed.releaseRequests) ? parsed.releaseRequests : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : []
    };
  } catch {
    return JSON.parse(JSON.stringify(defaults));
  }
}

function write(state) {
  ensure();
  const nextState = {
    auth: state && state.auth ? state.auth : defaults.auth,
    settings: state && state.settings ? state.settings : defaults.settings,
    releaseRequests: Array.isArray(state && state.releaseRequests) ? state.releaseRequests : [],
    logs: []
  };
  fs.writeFileSync(dataFile, JSON.stringify(nextState, null, 2), 'utf8');
}

module.exports = { read, write };
