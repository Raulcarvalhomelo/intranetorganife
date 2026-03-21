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

test('POST /api/request-release valida domínio obrigatório', async () => {
  const bad = await harness.requestJson('/api/request-release', { domain: '' });
  assert.equal(bad.status, 400);
  const badJson = await bad.json();
  assert.ok(typeof badJson.message === 'string' && badJson.message.length > 0);

  const good = await harness.requestJson('/api/request-release', {
    domain: 'example.com',
    originalUrl: 'https://example.com/path',
    user: 'u1',
    browser: 'Chrome',
    reason: 'acesso'
  });
  assert.equal(good.status, 201);
  const goodJson = await good.json();
  assert.ok(goodJson.request && goodJson.request.domain === 'example.com');
  assert.equal(goodJson.duplicate, false);
});

test('Fluxo /release-requests cria, deduplica, aprova e bloqueia', async () => {
  const requestA1 = await harness.requestJson('/api/request-release', {
    domain: 'a.example.com',
    originalUrl: 'https://a.example.com/x',
    user: 'u1',
    browser: 'Chrome',
    reason: 'acesso'
  });
  assert.equal(requestA1.status, 201);
  const reqA1 = await requestA1.json();

  const requestA2 = await harness.requestJson('/api/request-release', {
    domain: 'a.example.com',
    originalUrl: 'https://a.example.com/y',
    user: 'u1',
    browser: 'Chrome',
    reason: 'acesso'
  });
  assert.equal(requestA2.status, 200);
  const reqA2 = await requestA2.json();

  assert.equal(reqA1.request.domain, reqA2.request.domain);
  assert.equal(reqA1.request.id, reqA2.request.id);
  assert.equal(reqA2.duplicate, true);

  const listRes = await harness.request('/release-requests');
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.some((r) => r.domain === 'a.example.com'));

  const approveRes = await harness.request(`/release-requests/${encodeURIComponent(reqA1.request.id)}/approve`, { method: 'POST' });
  assert.equal(approveRes.status, 200);
  const approveJson = await approveRes.json();
  assert.equal(approveJson.status, 'aprovado_admin');

  const checkAllowed = await harness.requestJson('/api/check-site', { domain: 'https://a.example.com/' });
  assert.equal(checkAllowed.status, 200);
  const allowedJson = await checkAllowed.json();
  assert.equal(allowedJson.status, 'allowed');

  const blockRes = await harness.request(`/release-requests/${encodeURIComponent(reqA1.request.id)}/block`, { method: 'POST' });
  assert.equal(blockRes.status, 200);
  const blockJson = await blockRes.json();
  assert.equal(blockJson.status, 'bloqueado_admin');

  const checkBlocked = await harness.requestJson('/api/check-site', { domain: 'https://a.example.com/' });
  assert.equal(checkBlocked.status, 200);
  const blockedJson = await checkBlocked.json();
  assert.equal(blockedJson.status, 'blocked');
});
