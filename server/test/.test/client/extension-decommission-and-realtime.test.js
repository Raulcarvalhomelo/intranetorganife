'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../..');

function read(relativePath) {
  return fs.readFileSync(path.resolve(root, relativePath), 'utf8');
}

test('background limita fila de logs e consolida reload de settings via WebSocket', () => {
  const background = read('background.js');
  assert.match(background, /const WS_LOG_BATCH_LIMIT = 1000;/);
  assert.match(background, /let wsDroppedLogCount = 0;/);
  assert.match(background, /wsLogBatch\.splice\(0, overflow\);/);
  assert.match(background, /droppedLogCount: wsDroppedLogCount/);
  assert.match(background, /function scheduleSettingsReload\(\)/);
  assert.match(background, /setTimeout\(\(\) => \{/);
  assert.match(background, /\}, 500\);/);
  assert.match(background, /function setupWebSocket\(\)/);
  assert.match(background, /scheduleSettingsReload\(\);/);
});

test('Kanban da extensão permanece desativado sem remover backend legado', () => {
  const intranetHtml = read('intranet.html');
  const intranetJs = read('intranet.js');
  const kanbanHtml = read('kanban.html');
  const backendApp = read('server/backend/app.js');
  assert.match(intranetJs, /const KANBAN_EXTENSION_ENABLED = false;/);
  assert.match(intranetJs, /if \(KANBAN_EXTENSION_ENABLED\) initTodos\(\);/);
  assert.match(intranetHtml, /id="widgetTodos" hidden/);
  assert.match(intranetHtml, /id="kanbanOverlay" aria-hidden="true" hidden/);
  assert.match(intranetHtml, /id="kanbanPreviewOverlay" aria-hidden="true" hidden/);
  assert.match(kanbanHtml, /Kanban desativado na extensão/);
  assert.doesNotMatch(kanbanHtml, /<script src="kanban\.js"><\/script>/);
  assert.match(backendApp, /createKanbanRouter/);
});
