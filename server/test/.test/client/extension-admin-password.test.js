'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStateStore } = require('../../../backend/state');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'organife-extension-auth-'));
}

test('estado novo da extensão usa gadu333 como senha padrão', () => {
  const dataDir = tempDir();
  try {
    const store = createStateStore({ dataDir });
    const state = store.read();
    assert.equal(state.settings.adminPassword, 'gadu333');
    assert.equal(state.settings.adminPasswordConfigured, false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('estado legado com senha vazia é migrado para o default gadu333', () => {
  const dataDir = tempDir();
  try {
    fs.writeFileSync(path.join(dataDir, 'runtime-state.json'), JSON.stringify({ settings: { adminPassword: '' } }), 'utf8');
    const store = createStateStore({ dataDir });
    assert.equal(store.read().settings.adminPassword, 'gadu333');
    assert.equal(store.read().settings.adminPasswordConfigured, false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('default configurável é respeitado apenas quando o estado não possui senha explícita', () => {
  const dataDir = tempDir();
  try {
    fs.writeFileSync(path.join(dataDir, 'runtime-state.json'), JSON.stringify({ settings: { adminPassword: '' } }), 'utf8');
    const store = createStateStore({ dataDir, extensionAdminPasswordDefault: 'custom-admin' });
    assert.equal(store.read().settings.adminPassword, 'custom-admin');
    assert.equal(store.read().settings.adminPasswordConfigured, false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('background mantém default gadu333 e compatibilidade legada com admin', () => {
  const background = fs.readFileSync(path.resolve(__dirname, '../../../../background.js'), 'utf8');
  assert.match(background, /const EXTENSION_DEFAULT_ADMIN_PASSWORD = ['"]gadu333['"]/);
  assert.match(background, /const LEGACY_EXTENSION_DEFAULT_ADMIN_PASSWORD = ['"]admin['"]/);
  assert.match(background, /adminPasswordConfigured/);
  assert.match(background, /newAdminPassword\.length >= 4/);
});

test('senha explicitamente configurada permanece distinta do padrão', () => {
  const dataDir = tempDir();
  try {
    fs.writeFileSync(path.join(dataDir, 'runtime-state.json'), JSON.stringify({ settings: { adminPassword: 'nova-senha', adminPasswordConfigured: true } }), 'utf8');
    const store = createStateStore({ dataDir });
    const state = store.read();
    assert.equal(state.settings.adminPassword, 'nova-senha');
    assert.equal(state.settings.adminPasswordConfigured, true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('popup abre o painel com a aba Config ativa e login cross-browser', () => {
  const popupHtml = fs.readFileSync(path.resolve(__dirname, '../../../../popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.resolve(__dirname, '../../../../popup.js'), 'utf8');
  assert.match(popupHtml, /<button class="tab-btn active" data-tab="config">Config<\/button>/);
  assert.doesNotMatch(popupHtml, /<button class="tab-btn active" data-tab="sites">Sites<\/button>/);
  assert.match(popupHtml, /<div id="tab-config" class="tab-content active">/);
  assert.match(popupJs, /const startTab = currentAccessRole === 'restricted' \? 'logs' : 'config';/);
  assert.match(popupJs, /function sendRuntimeMessage\(message, callback\)/);
});

test('módulo IndexedDB não redeclara constantes globais do service worker', () => {
  const dbModule = fs.readFileSync(path.resolve(__dirname, '../../../../background-db.js'), 'utf8');
  assert.match(dbModule, /const ORGANIFE_DB_NAME/);
  assert.doesNotMatch(dbModule, /^const LOGS_DB_NAME/m);
});
