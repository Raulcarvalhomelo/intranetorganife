'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

function uniquePort() {
  return 15000 + Math.floor(Math.random() * 20000);
}

function waitForServerReady(child, timeoutMs) {
  const timeoutValue = timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderrBuffer = '';
    let stdoutBuffer = '';
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout aguardando servidor iniciar. stderr=${stderrBuffer}`));
    }, timeoutValue);
    const onData = (chunk) => {
      stdoutBuffer += String(chunk || '');
      if (!settled && stdoutBuffer.includes('Server running on')) {
        settled = true;
        cleanup();
        resolve();
      }
    };
    const onErrData = (chunk) => { stderrBuffer += String(chunk || ''); };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Servidor encerrou antes de iniciar. code=${code} stderr=${stderrBuffer}`));
    };
    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.stderr.off('data', onErrData);
      child.off('exit', onExit);
    }
    child.stdout.on('data', onData);
    child.stderr.on('data', onErrData);
    child.on('exit', onExit);
  });
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill();
  const ended = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 4000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  if (!ended) {
    try { child.kill('SIGKILL'); } catch (error) {}
  }
}

async function createServerHarness() {
  const serverDir = path.resolve(__dirname, '../../..');
  const backendPath = path.join(serverDir, 'backend', 'app.js');
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'organife-server-test-'));
  const databaseDir = path.join(tempRoot, 'database');
  await fs.promises.mkdir(databaseDir, { recursive: true });
  const initialState = {
    auth: { dashboardPassword: 'asdf', dashboardViewerPassword: 'zzzz' },
    settings: {
      adminPassword: '',
      restrictedPassword: '',
      tempPassword: '',
      companyName: 'Organife',
      companyNotice: '',
      serverUrl: 'http://localhost:1337',
      quickLinks: [],
      blockedKeywords: [],
      blockedSites: [],
      allowedLinks: [],
      allowedDomains: [],
      tempAllowedLinks: [],
      totalBlockMode: false,
      browserUser: ''
    },
    releaseRequests: [],
    logs: []
  };
  await fs.promises.writeFile(path.join(databaseDir, 'runtime-state.json'), JSON.stringify(initialState, null, 2), 'utf8');
  const port = uniquePort();
  const child = spawn('node', [backendPath], {
    cwd: serverDir,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      LOG_FLUSH_INTERVAL_MS: '200',
      ORGANIFE_DATABASE_DIR: databaseDir,
      DASHBOARD_SESSION_SECRET: 'isolated-test-secret'
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServerReady(child);
  } catch (error) {
    await stopProcess(child);
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }

  async function cleanup() {
    await stopProcess(child);
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  }

  async function request(pathname, options) {
    const baseUrl = `http://127.0.0.1:${port}`;
    return fetch(`${baseUrl}${pathname}`, options || {});
  }

  async function requestJson(pathname, payload, options) {
    const nextOptions = options || {};
    return request(pathname, Object.assign({}, nextOptions, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, nextOptions.headers || {}),
      body: JSON.stringify(payload)
    }));
  }

  async function loginDashboard(username, password) {
    const response = await requestJson('/dashboard/login', {
      username: username || 'admin',
      password: password || 'asdf'
    });
    const rawCookie = response.headers.get('set-cookie') || '';
    return { response, cookie: rawCookie.split(';')[0] };
  }

  return { request, requestJson, loginDashboard, cleanup, databaseDir };
}

module.exports = { createServerHarness };
