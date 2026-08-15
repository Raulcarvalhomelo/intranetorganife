const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('background.js usa WebSocket e não EventSource', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const code = fs.readFileSync(bgPath, 'utf8');
  assert.equal(/\bWebSocket\b/.test(code), true);
  assert.equal(/\bEventSource\b/.test(code), false);
  assert.equal(/replace\(\/\^http\/\s*,\s*['\"]ws['\"]\)/.test(code), true);
});
