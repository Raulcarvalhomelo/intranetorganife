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

async function openSseAndReadEvents(url, minEvents = 2) {
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal });
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  let buffer = '';
  const events = [];
  try {
    while (events.length < minEvents) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += Buffer.from(value).toString('utf8');
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const chunk = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data:'));
        const json = dataLine ? dataLine.replace(/^data:\s*/, '') : '{}';
        events.push(JSON.parse(json));
        if (events.length >= minEvents) break;
        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try { controller.abort(); } catch {}
  }
  return events;
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

test('POST /api/kanban/card emite delta SSE somente do card alterado', async () => {
  const healthRes = await harness.request('/health');
  assert.equal(healthRes.status, 200);
  const base = healthRes.url.replace(/\/health$/, '');

  const ssePromise = openSseAndReadEvents(`${base}/settings/updates`, 2);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const now = Date.now();
  const cardPayload = {
    id: `card-sse-${now}`,
    title: 'Card SSE Delta',
    description: 'Atualização por SSE',
    status: 'todo',
    priority: 'high',
    departments: ['Marketing'],
    due_at: now + 86400000,
    tags: ['sse'],
    attachments: [],
    recurrence: { type: 'none', lastTrigger: 0 },
    updated_at: now,
    created_at: now
  };
  const saveRes = await harness.requestJson('/api/kanban/card', cardPayload);
  assert.equal(saveRes.status, 201);

  const events = await ssePromise;
  assert.ok(events.length >= 2);
  const deltaEvent = events[events.length - 1];
  assert.equal(deltaEvent.updated, true);
  assert.equal(deltaEvent.kind, 'kanban');
  assert.equal(deltaEvent.channel, 'kanban');
  assert.equal(deltaEvent.action, 'upsert');
  assert.ok(deltaEvent.card && typeof deltaEvent.card === 'object');
  assert.equal(deltaEvent.card.id, cardPayload.id);
  assert.equal(deltaEvent.card.status, cardPayload.status);
  assert.equal(deltaEvent.card.deleted, 0);
  assert.deepEqual(deltaEvent.card.departments, ['Marketing']);
});
