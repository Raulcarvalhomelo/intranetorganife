'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogStore } = require('../../../backend/log-store');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'organife-log-pagination-'));
}

function sampleLogs() {
  return [
    { id: 'log-1', timestamp: '2026-08-18T10:05:00.000Z', browserUser: 'ana', type: 'navigation', url: 'https://example.com/a' },
    { id: 'log-2', timestamp: '2026-08-18T10:10:00.000Z', browserUser: 'bruno', type: 'navigation', url: 'https://example.com/b' },
    { id: 'log-3', timestamp: '2026-08-18T10:15:00.000Z', browserUser: 'ana', type: 'click', url: 'https://other.test/c' },
    { id: 'log-4', timestamp: '2026-08-18T10:20:00.000Z', browserUser: 'ana', type: 'navigation', url: 'https://example.com/d' }
  ];
}

test('log-store pagina logs por cursor sem repetir registros', async () => {
  const logsDir = tempDir();
  const store = createLogStore({ logsDir, retentionDays: 3 });
  try {
    await store.initialize();
    store.queueLogs(sampleLogs());
    await store.flush();
    const first = await store.readLogsPage({ day: '2026-08-18', limit: 2 });
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    assert.equal(first.items[0].id, 'log-4');
    assert.equal(first.items[1].id, 'log-3');
    const second = await store.readLogsPage({ day: '2026-08-18', limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.items.map((item) => item.id), ['log-2', 'log-1']);
    assert.equal(second.hasMore, false);
  } finally {
    await store.close();
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
});

test('log-store retorna página vazia quando o arquivo diário não existe', async () => {
  const logsDir = tempDir();
  const store = createLogStore({ logsDir, retentionDays: 3 });
  try {
    await store.initialize();
    const page = await store.readLogsPage({ day: '2026-08-19', limit: 50 });
    assert.deepEqual(page.items, []);
    assert.equal(page.hasMore, false);
    const secondPage = await store.readLogsPage({ day: '2026-08-19', limit: 50 });
    assert.deepEqual(secondPage.items, []);
  } finally {
    await store.close();
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
});

test('log-store aplica usuário, domínio, tipo e horário durante a leitura', async () => {
  const logsDir = tempDir();
  const store = createLogStore({ logsDir, retentionDays: 3 });
  try {
    await store.initialize();
    store.queueLogs(sampleLogs());
    await store.flush();
    const page = await store.readLogsPage({
      day: '2026-08-18',
      limit: 50,
      user: 'ana',
      domain: 'example.com',
      type: 'navigation',
      startTime: '10:00',
      endTime: '10:30'
    });
    assert.deepEqual(page.items.map((item) => item.id), ['log-4', 'log-1']);
    assert.equal(page.hasMore, false);
  } finally {
    await store.close();
    fs.rmSync(logsDir, { recursive: true, force: true });
  }
});
