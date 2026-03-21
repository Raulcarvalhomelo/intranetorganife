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

test('GET /health retorna ok e timestamp', async () => {
  const res = await harness.request('/health');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(typeof data.now === 'string' && data.now.includes('T'));
});
