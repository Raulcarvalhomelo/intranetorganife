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

test('APIs do dashboard exigem autenticação', async () => {
  const unauthorized = await harness.request('/dashboard/api/logs?limit=10');
  assert.equal(unauthorized.status, 401);
  const body = await unauthorized.json();
  assert.equal(body.message, 'nao-autorizado');
});

test('Login do dashboard permite consultar logs por usuário e dia', async () => {
  const setupStatus = await harness.request('/dashboard/api/setup-status');
  assert.equal(setupStatus.status, 200);
  const setupBody = await setupStatus.json();
  assert.equal(setupBody.requiresSetup, false);

  const login = await harness.loginDashboard();
  assert.equal(login.response.status, 200);
  assert.ok(login.cookie);

  await harness.requestJson('/api/log-access', {
    user_id: 'u-55',
    browserUser: 'usuario-filtro',
    browser: 'Edge',
    domain: 'filtro.com',
    status: 'allowed',
    url: 'https://filtro.com/page',
    title: 'Página Filtro'
  });

  await harness.requestJson('/api/log-access', {
    user_id: 'u-66',
    browserUser: 'outro-usuario',
    browser: 'Edge',
    domain: 'filtro.com',
    status: 'allowed',
    url: 'https://filtro.com/other',
    title: 'Outra Página'
  });

  await harness.sleep(1300);

  const day = new Date().toISOString().slice(0, 10);
  const query = `/dashboard/api/logs/by-user-day?day=${day}&user=${encodeURIComponent('usuario-filtro')}&limit=50`;
  const filteredRes = await harness.request(query, { headers: { cookie: login.cookie } });
  assert.equal(filteredRes.status, 200);
  const rows = await filteredRes.json();
  assert.ok(Array.isArray(rows));
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((row) => String(row.browserUser || row.user_id || '').toLowerCase().includes('usuario-filtro')));
});
