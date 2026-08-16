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
test.after(async () => { await harness.cleanup(); });

test('Dashboard carrega app.js e assets sem cache', async () => {
  const page = await harness.request('/dashboard/', { headers: { cookie } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<script[^>]+src=["']\.\/app\.js["']/);
  const asset = await harness.request('/dashboard/app.js', { headers: { cookie } });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control') || '', /no-store/);
});
