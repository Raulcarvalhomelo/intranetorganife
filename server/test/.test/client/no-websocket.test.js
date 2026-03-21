const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('background.js não deve usar WebSocket', async () => {
  const bgPath = path.resolve(__dirname, '../../../../background.js');
  const code = fs.readFileSync(bgPath, 'utf8');
  assert.equal(/\bWebSocket\b/.test(code), false);
  assert.equal(/\bws:\/\//i.test(code), false);
  assert.equal(/\bwss:\/\//i.test(code), false);
});
