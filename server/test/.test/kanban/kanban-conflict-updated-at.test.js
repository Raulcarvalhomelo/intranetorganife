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

test('Kanban API - deve ignorar update antigo por updatedAt', async () => {
  const dept = 'financeiro';
  const baseTime = Date.now();
  const card = {
    id: 'card-updated-at',
    title: 'T1',
    description: '',
    status: 'todo',
    priority: 'med',
    dueAt: null,
    tags: [],
    attachments: [],
    sprintId: null,
    recurrence: { type: 'none', lastTrigger: 0 },
    createdAt: baseTime,
    updatedAt: baseTime,
    deleted: 0,
    departments: ['Financeiro']
  };

  const createRes = await harness.requestJson('/api/kanban/card', card);
  assert.equal(createRes.status, 201);

  const newer = await harness.requestJson('/api/kanban/card', { ...card, title: 'T2', updatedAt: baseTime + 10 });
  assert.equal(newer.status, 201);

  const older = await harness.requestJson('/api/kanban/card', { ...card, title: 'T0', updatedAt: baseTime - 10 });
  assert.equal(older.status, 201);

  const listRes = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(dept)}`);
  assert.equal(listRes.status, 200);
  const json = await listRes.json();
  const list = json.cards;
  const found = list.find((c) => c.id === 'card-updated-at');
  assert.ok(found);
  assert.equal(found.title, 'T2');
});
