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

test('Kanban API - Card Sync and Department Filtering', async () => {
  const deptA = 'financeiro';
  const deptB = 'comercial';

  const now = Date.now();
  const cardA = {
    id: 'card-a',
    title: 'A',
    description: '',
    status: 'todo',
    priority: 'med',
    dueAt: null,
    tags: [],
    attachments: [],
    sprintId: null,
    recurrence: { type: 'none', lastTrigger: 0 },
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    departments: ['Financeiro']
  };

  const cardB = {
    ...cardA,
    id: 'card-b',
    title: 'B',
    departments: ['Comercial']
  };

  const cardShared = {
    ...cardA,
    id: 'card-shared',
    title: 'S',
    departments: ['Financeiro', 'Comercial']
  };

  const postA = await harness.requestJson('/api/kanban/card', cardA);
  assert.equal(postA.status, 201);
  const postB = await harness.requestJson('/api/kanban/card', cardB);
  assert.equal(postB.status, 201);
  const postShared = await harness.requestJson('/api/kanban/card', cardShared);
  assert.equal(postShared.status, 201);

  const getDeptARes = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptA)}`);
  assert.equal(getDeptARes.status, 200);
  const deptAJson = await getDeptARes.json();
  const deptAList = deptAJson.cards;
  assert.ok(Array.isArray(deptAList));
  assert.ok(deptAList.some((c) => c.id === 'card-a'));
  assert.ok(deptAList.some((c) => c.id === 'card-shared'));
  assert.ok(!deptAList.some((c) => c.id === 'card-b'));

  const getDeptBRes = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptB)}`);
  assert.equal(getDeptBRes.status, 200);
  const deptBJson = await getDeptBRes.json();
  const deptBList = deptBJson.cards;
  assert.ok(Array.isArray(deptBList));
  assert.ok(deptBList.some((c) => c.id === 'card-b'));
  assert.ok(deptBList.some((c) => c.id === 'card-shared'));
  assert.ok(!deptBList.some((c) => c.id === 'card-a'));

  const deleteShared = await harness.requestJson('/api/kanban/card', { ...cardShared, deleted: 1, updatedAt: now + 10 });
  assert.equal(deleteShared.status, 201);

  const getDeptAAfterDelete = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptA)}`);
  assert.equal(getDeptAAfterDelete.status, 200);
  const deptAAfterJson = await getDeptAAfterDelete.json();
  const deptAAfter = deptAAfterJson.cards;
  assert.ok(!deptAAfter.some((c) => c.id === 'card-shared'));

  const getWithoutDepartment = await harness.request('/api/kanban/cards');
  assert.equal(getWithoutDepartment.status, 400);
});

test('Kanban API - deve exigir departamento', async () => {
  const now = Date.now();
  const card = {
    id: 'card-no-dept',
    title: 'X',
    description: '',
    status: 'todo',
    priority: 'med',
    dueAt: null,
    tags: [],
    attachments: [],
    sprintId: null,
    recurrence: { type: 'none', lastTrigger: 0 },
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    departments: []
  };
  const res = await harness.requestJson('/api/kanban/card', card);
  assert.equal(res.status, 400);
});
