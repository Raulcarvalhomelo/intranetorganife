from pathlib import Path
p = Path('/home/ubuntu/intranetorganife/server/test/.test/settings/settings-updates-sse.test.js')
p.write_text("""const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('../../../../node_modules/ws');
const { createServerHarness } = require('../_helpers/server-harness');
let harness;
test.before(async () => { harness = await createServerHarness(); });
test.after(async () => { await harness.cleanup(); });
test('rotas SSE foram removidas', async () => {
  const health = await harness.request('/health');
  const base = health.url.replace(/\\/health$/, '');
  const settings = await fetch(`${base}/settings/updates`);
  const dashboard = await fetch(`${base}/dashboard/updates`);
  assert.equal(settings.status, 404);
  assert.equal(dashboard.status, 404);
});
test('POST /settings publica atualização via WebSocket', async () => {
  const health = await harness.request('/health');
  const base = health.url.replace(/\\/health$/, '');
  const socket = new WebSocket(base.replace(/^http/, 'ws') + 'ws');
  const messages = [];
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'hello', client: 'extension' }));
  await harness.requestJson('/settings', { companyNotice: `updated-${Date.now()}` });
  for (let index = 0; index < 20 && !messages.some((message) => message.type === 'state_update'); index += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(messages.some((message) => message.type === 'state_update'));
  socket.close();
});
""", encoding='utf8')
