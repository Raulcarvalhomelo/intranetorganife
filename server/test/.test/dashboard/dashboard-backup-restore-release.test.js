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

test('Release-requests do dashboard listam, filtram, aprovam e bloqueiam', async () => {
  const login = await harness.loginDashboard();
  const cookie = login.cookie;

  const createA = await harness.requestJson('/api/request-release', {
    domain: 'portal-alpha.com',
    reason: 'Acesso A',
    user: 'alice',
    browser: 'Edge'
  });
  assert.equal(createA.status, 201);
  const rowA = (await createA.json()).request;

  const createB = await harness.requestJson('/api/request-release', {
    domain: 'portal-beta.com',
    reason: 'Acesso B',
    user: 'bob',
    browser: 'Chrome'
  });
  assert.equal(createB.status, 201);
  const rowB = (await createB.json()).request;

  const allRowsRes = await harness.request('/dashboard/api/release-requests', { headers: { cookie } });
  assert.equal(allRowsRes.status, 200);
  const allRows = await allRowsRes.json();
  assert.ok(Array.isArray(allRows));
  assert.ok(allRows.some((row) => String(row.id) === String(rowA.id)));
  assert.ok(allRows.some((row) => String(row.id) === String(rowB.id)));

  const filteredRes = await harness.request('/dashboard/api/release-requests?user=ali', { headers: { cookie } });
  assert.equal(filteredRes.status, 200);
  const filteredRows = await filteredRes.json();
  assert.ok(filteredRows.every((row) => String(row.user || '').toLowerCase().includes('ali')));

  const approveRes = await harness.requestJson(`/dashboard/api/release-requests/${rowA.id}/approve`, {}, {
    headers: { cookie }
  });
  assert.equal(approveRes.status, 200);
  const approveBody = await approveRes.json();
  assert.equal(approveBody.status, 'aprovado_admin');

  const blockRes = await harness.requestJson(`/dashboard/api/release-requests/${rowB.id}/block`, {}, {
    headers: { cookie }
  });
  assert.equal(blockRes.status, 200);
  const blockBody = await blockRes.json();
  assert.equal(blockBody.status, 'bloqueado_admin');
});

test('Dashboard logs, backup e restore funcionam corretamente', async () => {
  const login = await harness.loginDashboard();
  const cookie = login.cookie;

  await harness.requestJson('/api/log-access', {
    user_id: 'u-log-1',
    browserUser: 'usuario-dashboard-log',
    browser: 'Edge',
    domain: 'empresa.com',
    status: 'allowed',
    url: 'https://empresa.com/a',
    title: 'A'
  });
  await harness.sleep(1300);

  const dashboardLogs = await harness.request('/dashboard/api/logs?user=usuario-dashboard-log&limit=20', {
    headers: { cookie }
  });
  assert.equal(dashboardLogs.status, 200);
  const dashboardLogsRows = await dashboardLogs.json();
  assert.ok(Array.isArray(dashboardLogsRows));
  assert.ok(dashboardLogsRows.some((row) => String(row.browserUser || '').includes('usuario-dashboard-log')));

  const backupRes = await harness.request('/dashboard/api/backup', { headers: { cookie } });
  assert.equal(backupRes.status, 200);
  const backupBody = await backupRes.json();
  assert.ok(Array.isArray(backupBody.logs));
  assert.ok(Array.isArray(backupBody.releaseRequests));
  assert.ok(backupBody.settings && typeof backupBody.settings === 'object');

  const restoreRes = await harness.requestJson('/dashboard/api/restore', {
    settings: {
      companyName: 'Empresa Restaurada',
      companyNotice: 'Aviso restaurado',
      serverUrl: 'http://localhost:1337',
      quickLinks: [{ name: 'Restaurado', url: 'http://localhost:1337/dashboard/' }],
      blockedSites: ['restaurado-bloqueado.com'],
      allowedDomains: ['restaurado-liberado.com']
    },
    releaseRequests: [
      {
        id: 555001,
        domain: 'restaurado.com',
        reason: 'restore',
        user: 'qa',
        browser: 'Edge',
        status: 'pendente',
        timestamp: new Date().toISOString()
      }
    ],
    logs: [
      {
        id: 777001,
        timestamp: new Date().toISOString(),
        type: 'access',
        browserUser: 'usuario-restaurado',
        browser: 'Edge',
        domain: 'restore.local',
        status: 'allowed',
        details: { url: 'https://restore.local', title: 'Restore' }
      }
    ]
  }, {
    headers: { cookie }
  });
  assert.equal(restoreRes.status, 200);
  const restoreBody = await restoreRes.json();
  assert.equal(restoreBody.ok, true);

  const configAfterRestore = await harness.request('/dashboard/api/config', { headers: { cookie } });
  assert.equal(configAfterRestore.status, 200);
  const configAfterRestoreBody = await configAfterRestore.json();
  assert.equal(configAfterRestoreBody.companyName, 'Empresa Restaurada');
  assert.equal(configAfterRestoreBody.serverUrl, 'http://localhost:1337');

  const releaseAfterRestore = await harness.request('/dashboard/api/release-requests?user=qa', {
    headers: { cookie }
  });
  assert.equal(releaseAfterRestore.status, 200);
  const releaseAfterRestoreBody = await releaseAfterRestore.json();
  assert.ok(releaseAfterRestoreBody.some((row) => String(row.user || '') === 'qa'));

  await harness.sleep(1300);
  const logsAfterRestore = await harness.request('/dashboard/api/logs?user=usuario-restaurado&limit=20', {
    headers: { cookie }
  });
  assert.equal(logsAfterRestore.status, 200);
  const logsAfterRestoreBody = await logsAfterRestore.json();
  assert.ok(logsAfterRestoreBody.some((row) => String(row.browserUser || '') === 'usuario-restaurado'));
});
