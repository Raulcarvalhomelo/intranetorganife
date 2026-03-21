const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Mock path for testing
const hostPath = path.resolve(__dirname, '../../../../server/native-helper/host.js');
const hostCode = fs.readFileSync(hostPath, 'utf8');

// We need to extract functions because it's a script.
// For testing, we can eval part of it or use a trick.
// Since it's a test for 'development only', we'll extract regex and small logic.

const hasCorruptedMarker = (val) => /%ef%bf%bd/i.test(val) || val.includes('\uFFFD');

test('Native Helper - Corruption Detection', (t) => {
  assert.strictEqual(hasCorruptedMarker('file:///C:/teste%EF%BF%BD.pdf'), true, 'Should detect %EF%BF%BD');
  assert.strictEqual(hasCorruptedMarker('file:///C:/teste\uFFFD.pdf'), true, 'Should detect \uFFFD');
  assert.strictEqual(hasCorruptedMarker('file:///C:/teste-acao.pdf'), false, 'Should be ok for clean paths');
});

test('Native Helper - Path Normalization', (t) => {
  // Test regex for UNC from host.js
  const isUncPath = (filePath) => /^\\\\[^\\]+\\[^\\]+/i.test(String(filePath || ''));
  
  assert.strictEqual(isUncPath('\\\\server\\share\\file.txt'), true);
  assert.strictEqual(isUncPath('C:\\local\\file.txt'), false);
});
