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

test('GET e POST /settings aplicam regras de configuração', async () => {
  const getBefore = await harness.request('/settings');
  assert.equal(getBefore.status, 200);
  const beforeBody = await getBefore.json();
  assert.ok(Array.isArray(beforeBody.blockedSites));

  const updatePayload = {
    companyName: 'Empresa Teste',
    blockedSites: ['bloqueado.com', 'bloqueado.com'],
    allowedDomains: ['liberado.com', 'liberado.com'],
    blockedKeywords: ['jogo', 'jogo']
  };
  const postRes = await harness.requestJson('/settings', updatePayload);
  assert.equal(postRes.status, 200);
  const postBody = await postRes.json();
  assert.equal(postBody.companyName, 'Empresa Teste');
  assert.deepEqual(postBody.blockedSites, ['bloqueado.com']);
  assert.deepEqual(postBody.allowedDomains, ['liberado.com']);
  assert.deepEqual(postBody.blockedKeywords, ['jogo']);
});

test('POST /api/check-site respeita bloqueio e liberação', async () => {
  const setupRes = await harness.requestJson('/settings', {
    blockedSites: ['portal.bloqueado.com'],
    allowedDomains: ['dominio.liberado.com']
  });
  assert.equal(setupRes.status, 200);

  const blockedRes = await harness.requestJson('/api/check-site', { domain: 'https://portal.bloqueado.com/path' });
  assert.equal(blockedRes.status, 200);
  assert.deepEqual(await blockedRes.json(), { status: 'blocked' });

  const allowedRes = await harness.requestJson('/api/check-site', { domain: 'https://dominio.liberado.com/home' });
  assert.equal(allowedRes.status, 200);
  assert.deepEqual(await allowedRes.json(), { status: 'allowed' });
});
