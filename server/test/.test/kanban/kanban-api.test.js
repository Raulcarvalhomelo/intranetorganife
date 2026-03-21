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
  const suffix = Date.now().toString(36);
  const deptA = `Fiscal-${suffix}`;
  const deptB = `DP-${suffix}`;
  const cardA = `card-a-${suffix}`;
  const cardB = `card-b-${suffix}`;
  const cardShared = `card-shared-${suffix}`;

  const postA = await harness.requestJson('/api/kanban/card', {
    id: cardA,
    title: 'Task for Fiscal',
    status: 'todo',
    departments: [deptA],
    updated_at: Date.now()
  });
  assert.equal(postA.status, 201);

  const postB = await harness.requestJson('/api/kanban/card', {
    id: cardB,
    title: 'Task for DP',
    status: 'doing',
    departments: [deptB],
    updated_at: Date.now()
  });
  assert.equal(postB.status, 201);

  const postShared = await harness.requestJson('/api/kanban/card', {
    id: cardShared,
    title: 'Task for Both',
    status: 'done',
    departments: [deptA, deptB],
    updated_at: Date.now()
  });
  assert.equal(postShared.status, 201);

  const getDeptARes = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptA)}`);
  assert.equal(getDeptARes.status, 200);
  const deptAData = await getDeptARes.json();
  const deptACards = Array.isArray(deptAData.cards) ? deptAData.cards : [];

  assert.ok(deptACards.some((card) => card.id === cardA));
  assert.ok(deptACards.some((card) => card.id === cardShared));
  assert.ok(!deptACards.some((card) => card.id === cardB));

  const getDeptBRes = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptB)}`);
  assert.equal(getDeptBRes.status, 200);
  const deptBData = await getDeptBRes.json();
  const deptBCards = Array.isArray(deptBData.cards) ? deptBData.cards : [];

  assert.ok(deptBCards.some((card) => card.id === cardB));
  assert.ok(deptBCards.some((card) => card.id === cardShared));
  assert.ok(!deptBCards.some((card) => card.id === cardA));

  const deleteShared = await harness.requestJson('/api/kanban/card', {
    id: cardShared,
    deleted: 1,
    updated_at: Date.now() + 1000
  });
  assert.equal(deleteShared.status, 201);

  const getDeptAAfterDelete = await harness.request(`/api/kanban/cards?department=${encodeURIComponent(deptA)}`);
  assert.equal(getDeptAAfterDelete.status, 200);
  const deptAAfterDeleteData = await getDeptAAfterDelete.json();
  const deptAAfterDeleteCards = Array.isArray(deptAAfterDeleteData.cards) ? deptAAfterDeleteData.cards : [];
  assert.ok(!deptAAfterDeleteCards.some((card) => card.id === cardShared));

  const getWithoutDepartment = await harness.request('/api/kanban/cards');
  assert.equal(getWithoutDepartment.status, 400);
});
