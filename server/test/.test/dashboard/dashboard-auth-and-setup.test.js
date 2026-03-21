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

test('Rotas públicas e protegidas do dashboard respondem corretamente', async () => {
  const root = await harness.request('/', { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/dashboard/');

  const loginPage = await harness.request('/dashboard/login');
  assert.equal(loginPage.status, 200);
  const loginHtml = await loginPage.text();
  assert.ok(loginHtml.toLowerCase().includes('<html'));

  const dashboardNoAuth = await harness.request('/dashboard/', { redirect: 'manual' });
  assert.equal(dashboardNoAuth.status, 302);
  assert.equal(dashboardNoAuth.headers.get('location'), '/dashboard/login');

  const login = await harness.loginDashboard();
  assert.equal(login.response.status, 200);
  assert.ok(login.cookie);

  const dashboardAuth = await harness.request('/dashboard/', { headers: { cookie: login.cookie } });
  assert.equal(dashboardAuth.status, 200);
  const dashboardHtml = await dashboardAuth.text();
  assert.ok(dashboardHtml.toLowerCase().includes('<html'));

  const appJs = await harness.request('/dashboard/app.js', { headers: { cookie: login.cookie } });
  assert.equal(appJs.status, 200);

  const stylesCss = await harness.request('/dashboard/styles.css', { headers: { cookie: login.cookie } });
  assert.equal(stylesCss.status, 200);

  const apiHealth = await harness.request('/dashboard/api/health', { headers: { cookie: login.cookie } });
  assert.equal(apiHealth.status, 200);
  const apiHealthBody = await apiHealth.json();
  assert.equal(apiHealthBody.ok, true);

  const session = await harness.request('/dashboard/api/session', { headers: { cookie: login.cookie } });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody.username, 'admin');
  assert.equal(sessionBody.role, 'admin');
});

test('SSE do dashboard e logout funcionam com autenticação', async () => {
  const login = await harness.loginDashboard();
  assert.equal(login.response.status, 200);

  const sseRes = await harness.request('/dashboard/updates', { headers: { cookie: login.cookie } });
  assert.equal(sseRes.status, 200);
  const reader = sseRes.body.getReader();
  const firstChunk = await reader.read();
  const text = Buffer.from(firstChunk.value || new Uint8Array()).toString('utf8');
  assert.ok(text.includes('data:'));
  assert.ok(text.includes('"kind":"bootstrap"'));
  await reader.cancel();

  const logout = await harness.request('/dashboard/logout', {
    method: 'POST',
    headers: { cookie: login.cookie }
  });
  assert.equal(logout.status, 204);
  const clearedCookie = String(logout.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(clearedCookie.startsWith('dashboard_session='));

  const afterLogout = await harness.request('/dashboard/api/health', { headers: { cookie: clearedCookie } });
  assert.equal(afterLogout.status, 401);
});

test('Fluxo de setup do dashboard funciona quando setup está pendente', async () => {
  const login = await harness.loginDashboard();
  assert.equal(login.response.status, 200);

  const makeSetupRequired = await harness.requestJson('/dashboard/api/restore', {
    auth: { dashboardPassword: '' }
  }, {
    headers: { cookie: login.cookie }
  });
  assert.equal(makeSetupRequired.status, 200);

  const statusRequired = await harness.request('/dashboard/api/setup-status');
  assert.equal(statusRequired.status, 200);
  const setupBody = await statusRequired.json();
  assert.equal(setupBody.requiresSetup, true);

  const loginBlocked = await harness.requestJson('/dashboard/login', {
    username: 'admin',
    password: 'asdf'
  });
  assert.equal(loginBlocked.status, 409);

  const emptyPassword = await harness.requestJson('/dashboard/setup', { password: '' });
  assert.equal(emptyPassword.status, 400);

  const confirmMismatch = await harness.requestJson('/dashboard/setup', {
    password: 'novaSenha123',
    confirmPassword: 'outraSenha'
  });
  assert.equal(confirmMismatch.status, 400);

  const setupDone = await harness.requestJson('/dashboard/setup', {
    password: 'novaSenha123',
    confirmPassword: 'novaSenha123'
  });
  assert.equal(setupDone.status, 200);
  const setupDoneBody = await setupDone.json();
  assert.equal(setupDoneBody.ok, true);
  assert.equal(setupDoneBody.role, 'admin');

  const loginWithNew = await harness.requestJson('/dashboard/login', {
    username: 'admin',
    password: 'novaSenha123'
  });
  assert.equal(loginWithNew.status, 200);
});
