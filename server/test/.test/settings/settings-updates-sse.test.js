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

test('GET /settings/updates envia evento bootstrap SSE', async () => {
  const controller = new AbortController();
  const response = await harness.request('/settings/updates', { signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const firstChunk = await reader.read();
  const text = Buffer.from(firstChunk.value || new Uint8Array()).toString('utf8');
  assert.ok(text.includes('data:'));
  assert.ok(text.includes('"kind":"bootstrap"'));
  controller.abort();
});
