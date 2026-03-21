const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerHarness } = require('../_helpers/server-harness');

let harness;

test.before(async () => {
  harness = await createServerHarness();
});

test.after(async () => {
  await harness.cleanup();
});

test('Settings e config do dashboard respeitam permissões de admin e viewer', async () => {
  const login = await harness.loginDashboard();
  const adminCookie = login.cookie;
  assert.ok(adminCookie);

  const getSettings = await harness.request('/dashboard/api/settings', { headers: { cookie: adminCookie } });
  assert.equal(getSettings.status, 200);
  const settingsBody = await getSettings.json();
  assert.ok(Array.isArray(settingsBody.blockedSites));

  const updateSettings = await harness.requestJson('/dashboard/api/settings', {
    blockedSites: ['site-1.com', 'site-1.com'],
    allowedDomains: ['lib-1.com', 'lib-1.com']
  }, {
    headers: { cookie: adminCookie }
  });
  assert.equal(updateSettings.status, 200);
  const updateSettingsBody = await updateSettings.json();
  assert.deepEqual(updateSettingsBody.blockedSites, ['site-1.com']);
  assert.deepEqual(updateSettingsBody.allowedDomains, ['lib-1.com']);

  const updateConfig = await harness.requestJson('/dashboard/api/config', {
    companyName: 'Empresa QA',
    companyNotice: 'Aviso teste',
    serverUrl: 'http://localhost:1337',
    quickLinks: [{ name: 'Painel', url: 'http://localhost:1337/dashboard/' }]
  }, {
    headers: { cookie: adminCookie }
  });
  assert.equal(updateConfig.status, 200);
  const updateConfigBody = await updateConfig.json();
  assert.equal(updateConfigBody.companyName, 'Empresa QA');
  assert.equal(updateConfigBody.serverUrl, 'http://localhost:1337');
  assert.equal(updateConfigBody.companyNotice, 'Aviso teste');
  assert.ok(Array.isArray(updateConfigBody.quickLinks));
  assert.equal(updateConfigBody.quickLinks.length, 1);
});

test('Endpoint de passwords valida entradas e permite login viewer', async () => {
  const login = await harness.loginDashboard();
  const adminCookie = login.cookie;

  const emptyPayload = await harness.requestJson('/dashboard/api/passwords', {}, {
    headers: { cookie: adminCookie }
  });
  assert.equal(emptyPayload.status, 400);

  const wrongCurrent = await harness.requestJson('/dashboard/api/passwords', {
    currentDashboardPassword: 'invalida',
    newViewerPassword: 'viewer123'
  }, {
    headers: { cookie: adminCookie }
  });
  assert.equal(wrongCurrent.status, 401);

  const updatePasswords = await harness.requestJson('/dashboard/api/passwords', {
    currentDashboardPassword: 'asdf',
    newViewerPassword: 'viewer123',
    newAdminPassword: 'admin999',
    newRestrictedPassword: 'restrito999'
  }, {
    headers: { cookie: adminCookie }
  });
  assert.equal(updatePasswords.status, 200);
  const updatePasswordsBody = await updatePasswords.json();
  assert.equal(updatePasswordsBody.ok, true);
  assert.equal(updatePasswordsBody.viewerPasswordChanged, true);
  assert.equal(updatePasswordsBody.adminPasswordChanged, true);
  assert.equal(updatePasswordsBody.restrictedPasswordChanged, true);

  const viewerLogin = await harness.requestJson('/dashboard/login', {
    username: 'visualizacao',
    password: 'viewer123'
  });
  assert.equal(viewerLogin.status, 200);
  const viewerCookie = String(viewerLogin.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(viewerCookie);

  const viewerNoticeOnly = await harness.requestJson('/dashboard/api/config', {
    companyNotice: 'Aviso viewer'
  }, {
    headers: { cookie: viewerCookie }
  });
  assert.equal(viewerNoticeOnly.status, 200);
  const viewerNoticeOnlyBody = await viewerNoticeOnly.json();
  assert.equal(viewerNoticeOnlyBody.companyNotice, 'Aviso viewer');

  const viewerForbiddenConfig = await harness.requestJson('/dashboard/api/config', {
    serverUrl: 'http://192.168.100.34:1337'
  }, {
    headers: { cookie: viewerCookie }
  });
  assert.equal(viewerForbiddenConfig.status, 403);

  const viewerForbiddenSettings = await harness.request('/dashboard/api/settings', {
    headers: { cookie: viewerCookie }
  });
  assert.equal(viewerForbiddenSettings.status, 403);
});
