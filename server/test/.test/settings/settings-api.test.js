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
  const initial = await harness.request('/settings');
  assert.equal(initial.status, 200);
  const initialData = await initial.json();
  assert.ok(initialData && typeof initialData === 'object');

  const payload = {
    totalBlockMode: true,
    blockedSites: ['*.example.com', '*.example.com'],
    allowedDomains: ['*.allowed.com', '*.allowed.com'],
    tempAllowedLinks: ['*.temp.com', '*.temp.com'],
    blockedKeywords: ['x', 'x'],
    allowedLinks: ['https://allowed-link.example', 'https://allowed-link.example']
  };

  const post = await harness.requestJson('/settings', payload);
  assert.equal(post.status, 200);
  const saved = await post.json();

  assert.equal(saved.totalBlockMode, true);
  assert.deepEqual(saved.blockedSites, ['*.example.com']);
  assert.deepEqual(saved.allowedDomains, ['*.allowed.com']);
  assert.deepEqual(saved.tempAllowedLinks, ['*.temp.com']);
  assert.deepEqual(saved.blockedKeywords, ['x']);
  assert.deepEqual(saved.allowedLinks, ['https://allowed-link.example']);

  const after = await harness.request('/settings');
  assert.equal(after.status, 200);
  const afterData = await after.json();
  assert.deepEqual(afterData.blockedSites, ['*.example.com']);
});

test('POST /api/check-site respeita bloqueio e liberação', async () => {
  const post = await harness.requestJson('/settings', {
    blockedSites: ['*.blocked.com'],
    allowedDomains: ['*.blocked.com', '*.allowed.com']
  });
  assert.equal(post.status, 200);

  const blocked = await harness.requestJson('/api/check-site', { domain: 'https://www.blocked.com/path' });
  assert.equal(blocked.status, 200);
  const blockedData = await blocked.json();
  assert.equal(blockedData.status, 'blocked');

  const allowed = await harness.requestJson('/api/check-site', { domain: 'https://www.allowed.com/path' });
  assert.equal(allowed.status, 200);
  const allowedData = await allowed.json();
  assert.equal(allowedData.status, 'allowed');
});
