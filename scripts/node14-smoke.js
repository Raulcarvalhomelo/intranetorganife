'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');
const WebSocket = require('../server/node_modules/ws');

function request(port, pathname, method, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: method || 'GET', headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {} }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (error) { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`startup-timeout: ${output}`)), 15000);
    child.stdout.on('data', (chunk) => {
      output += String(chunk || '');
      if (output.indexOf('Server running on') >= 0) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`startup-exit-${code}: ${output}`));
    });
  });
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organife-node14-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = childProcess.spawn(process.execPath, [path.join(__dirname, '../server/backend/app.js')], {
    cwd: path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { PORT: String(port), ORGANIFE_DATABASE_DIR: root, LOG_FLUSH_INTERVAL_MS: '200', DASHBOARD_SESSION_SECRET: 'node14-smoke-secret' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForReady(child);
    const health = await request(port, '/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.ok, true);
    const settings = await request(port, '/settings', 'POST', { companyNotice: 'node14' });
    assert.strictEqual(settings.status, 200);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    ws.on('message', (data) => { try { messages.push(JSON.parse(String(data))); } catch (error) {} });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'hello', client: 'extension' }));
    ws.send(JSON.stringify({ type: 'logs_batch', logs: [{ id: 'node14-log', timestamp: new Date().toISOString(), action: 'access', browserUser: 'node14', details: { url: 'https://example.test' } }] }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.ok(messages.some((message) => message.type === 'hello_ack'));
    assert.ok(messages.some((message) => message.type === 'logs_ack'));
    ws.close();
    const logsDir = path.join(root, 'logs');
    const files = fs.readdirSync(logsDir).filter((file) => /\.ndjson$/.test(file));
    assert.ok(files.length >= 1);
    const raw = fs.readFileSync(path.join(logsDir, files[0]), 'utf8').trim();
    assert.strictEqual(JSON.parse(raw).id, 'node14-log');
    process.stdout.write('Node 14 smoke test passed\n');
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
