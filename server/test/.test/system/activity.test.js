'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivity } = require('../../../backend/activity');

test('agrega logs existentes em sessões por usuário e domínio', () => {
  const activity = buildActivity([
    {
      id: 'one',
      browserUser: 'ana',
      timestamp: '2026-08-18T09:00:00.000Z',
      action: 'navigation',
      details: { url: 'https://example.com/home' }
    },
    {
      id: 'two',
      browserUser: 'ana',
      timestamp: '2026-08-18T09:05:00.000Z',
      action: 'navigation',
      details: { url: 'https://example.com/work' }
    },
    {
      id: 'three',
      browserUser: 'ana',
      timestamp: '2026-08-18T09:30:00.000Z',
      action: 'navigation',
      details: { url: 'https://other.example/report' }
    },
    {
      id: 'three',
      browserUser: 'ana',
      timestamp: '2026-08-18T09:30:00.000Z',
      action: 'navigation',
      details: { url: 'https://other.example/report' }
    }
  ]);

  assert.equal(activity.events, 3);
  assert.equal(activity.sessions, 2);
  assert.equal(activity.users, 1);
  assert.equal(activity.domains.length, 2);
  assert.equal(activity.domains[0].domain, 'example.com');
  assert.ok(activity.observedMs > 0);
});

test('ignora eventos sem timestamp válido e preserva estado de dados vazios', () => {
  const activity = buildActivity([{ id: 'invalid', browserUser: 'ana', timestamp: 'invalid' }]);
  assert.equal(activity.events, 0);
  assert.equal(activity.sessions, 0);
  assert.equal(activity.users, 0);
  assert.deepEqual(activity.domains, []);
  assert.deepEqual(activity.timeline, []);
});
