'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('../server/node_modules/ws');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'organife-ws-'));
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
const port = 14678;
const child = spawn(process.execPath, ['server/backend/app.js'], {
  cwd: path.resolve(__dirname, '..'),
  env: Object.assign({}, process.env, { PORT: String(port), ORGANIFE_DATABASE_DIR: root }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (chunk) => { output += String(chunk); });
child.stderr.on('data', (chunk) => { output += String(chunk); });

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function run() {
  try {
    for (let attempt = 0; attempt < 30 && output.indexOf('Server running on') < 0; attempt += 1) await wait(100);
    if (output.indexOf('Server running on') < 0) throw new Error(output || 'server did not start');
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    socket.on('message', (data) => messages.push(JSON.parse(String(data))));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.send(JSON.stringify({ type: 'hello', client: 'extension' }));
    socket.send(JSON.stringify({ type: 'logs_batch', logs: [{ id: 1, timestamp: new Date().toISOString(), action: 'navigation', details: { url: 'https://example.com' } }] }));
    for (let attempt = 0; attempt < 30 && !messages.some((message) => message.type === 'logs_ack'); attempt += 1) await wait(100);
    if (!messages.some((message) => message.type === 'logs_ack')) throw new Error('logs_ack not received');
    await wait(1400);
    const day = new Date().toISOString().slice(0, 10);
    const logPath = path.join(root, 'logs', `${day}.ndjson`);
    if (!fs.existsSync(logPath) || !fs.readFileSync(logPath, 'utf8').trim()) throw new Error('NDJSON was not written');
    socket.close();
    process.stdout.write('WebSocket smoke test passed\n');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(root, { recursive: true, force: true });
  }
}()).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
