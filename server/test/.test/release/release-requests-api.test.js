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
  const res = await harness.requestJson('/api/request-release', { user: 'joao' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.message, 'domain-obrigatorio');
});

test('Fluxo /release-requests cria, deduplica, aprova e bloqueia', async () => {
  const createRes = await harness.requestJson('/release-requests', {
    domain: 'news.portal.com',
    reason: 'Acesso de trabalho',
    user: 'joao',
    browser: 'Edge',
    clientRequestId: 'req-1'
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.status, 'pendente');
  assert.equal(created.duplicate, false);
  const createdId = created.request.id;

  const duplicateRes = await harness.requestJson('/release-requests', {
    domain: 'news.portal.com',
    reason: 'Acesso de trabalho',
    user: 'joao',
    browser: 'Edge',
    clientRequestId: 'req-1'
  });
  assert.equal(duplicateRes.status, 200);
  const duplicateBody = await duplicateRes.json();
  assert.equal(duplicateBody.duplicate, true);

  const listRes = await harness.request('/release-requests');
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.some((row) => String(row.id) === String(createdId)));

  const approveRes = await harness.requestJson(`/release-requests/${createdId}/approve`, {});
  assert.equal(approveRes.status, 200);
  const approveBody = await approveRes.json();
  assert.equal(approveBody.status, 'aprovado_admin');

  const settingsAfterApprove = await (await harness.request('/settings')).json();
  assert.ok(settingsAfterApprove.allowedDomains.includes('news.portal.com'));

  const createToBlock = await harness.requestJson('/api/request-release', {
    domain: 'bloquear-agora.com',
    reason: 'Teste',
    user: 'maria',
    browser: 'Chrome'
  });
  assert.equal(createToBlock.status, 201);
  const blockTarget = await createToBlock.json();
  const blockRes = await harness.requestJson(`/release-requests/${blockTarget.request.id}/block`, {});
  assert.equal(blockRes.status, 200);
  const blockBody = await blockRes.json();
  assert.equal(blockBody.status, 'bloqueado_admin');

  const settingsAfterBlock = await (await harness.request('/settings')).json();
  assert.ok(settingsAfterBlock.blockedSites.includes('bloquear-agora.com'));
});
