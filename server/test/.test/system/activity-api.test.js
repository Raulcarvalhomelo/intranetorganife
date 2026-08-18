'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServerHarness } = require('../_helpers/server-harness');

let harness;
let cookie;

test.before(async () => {
  harness = await createServerHarness();
  const login = await harness.loginDashboard('admin', 'asdf');
  assert.equal(login.response.status, 200);
  cookie = login.cookie;
});

test.after(async () => {
  await harness.cleanup();
});

test('atividade exige autenticação e agrega logs existentes', async () => {
  const unauthorized = await harness.request('/dashboard/api/activity/summary');
  assert.equal(unauthorized.status, 401);

  const created = await harness.requestJson('/logs', {
    id: 'activity-api-1',
    browserUser: 'ana',
    browser: 'Chrome',
    timestamp: '2026-08-18T09:00:00.000Z',
    action: 'navigation',
    details: { url: 'https://intranet.example/home' }
  });
  assert.equal(created.status, 201);

  const response = await harness.request('/dashboard/api/activity/summary?day=2026-08-18', { headers: { cookie } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.events, 1);
  assert.equal(data.sessions, 1);
  assert.equal(data.users, 1);
  assert.equal(data.domains[0].domain, 'intranet.example');
  assert.equal(data.timeline[0].user, 'ana');
});
