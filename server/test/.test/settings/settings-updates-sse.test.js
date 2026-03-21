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

async function readFirstSseEvent(url) {
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += Buffer.from(value).toString('utf8');
      const idx = buffer.indexOf('\n\n');
      if (idx >= 0) {
        const first = buffer.slice(0, idx);
        const dataLine = first.split('\n').find((l) => l.startsWith('data:'));
        const json = dataLine ? dataLine.replace(/^data:\s*/, '') : '{}';
        controller.abort();
        return JSON.parse(json);
      }
    }
  } finally {
    try { controller.abort(); } catch {}
  }
  throw new Error('SSE sem evento inicial');
}

test('GET /settings/updates envia evento bootstrap SSE', async () => {
  const portRes = await harness.request('/health');
  assert.equal(portRes.status, 200);

  const base = portRes.url.replace(/\/health$/, '');
  const payload = await readFirstSseEvent(`${base}/settings/updates`);
  assert.equal(payload.updated, true);
  assert.equal(payload.kind, 'bootstrap');
  assert.ok(typeof payload.at === 'string' && payload.at.includes('T'));
});
