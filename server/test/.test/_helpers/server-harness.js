const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniquePort() {
  const base = 15000;
  const span = 20000;
  return base + Math.floor(Math.random() * span);
}

async function exists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function waitForServerReady(child, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    const onData = (chunk) => {
      const text = String(chunk || '');
      stdoutBuffer += text;
      if (stdoutBuffer.includes('Server running on')) {
        settled = true;
        cleanup();
        resolve();
      }
    };
    const onErrData = (chunk) => {
      stderrBuffer += String(chunk || '');
    };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Servidor encerrou antes de iniciar. code=${code} stderr=${stderrBuffer}`));
    };
    const onTimeout = () => {
      if (settled) return;
      if (Date.now() - startedAt < timeoutMs) {
        setTimeout(onTimeout, 100);
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(`Timeout aguardando servidor iniciar. stderr=${stderrBuffer}`));
    };
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.stderr.off('data', onErrData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onErrData);
    child.on('exit', onExit);
    setTimeout(onTimeout, 100);
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
  if (ended) return;
  try {
    child.kill('SIGKILL');
  } catch {}
}

function normalizeState(state) {
  const current = state && typeof state === 'object' ? state : {};
  const currentSettings = current.settings && typeof current.settings === 'object' ? current.settings : {};
  return {
    auth: {
      ...(current.auth || {}),
      dashboardPassword: 'asdf'
    },
    settings: {
      adminPassword: String(currentSettings.adminPassword || ''),
      restrictedPassword: String(currentSettings.restrictedPassword || ''),
      tempPassword: String(currentSettings.tempPassword || ''),
      companyName: String(currentSettings.companyName || 'Organife'),
      companyNotice: String(currentSettings.companyNotice || ''),
      serverUrl: String(currentSettings.serverUrl || 'http://localhost:1337'),
      quickLinks: Array.isArray(currentSettings.quickLinks) ? currentSettings.quickLinks : [],
      blockedKeywords: [],
      blockedSites: [],
      allowedLinks: [],
      allowedDomains: [],
      tempAllowedLinks: [],
      totalBlockMode: Boolean(currentSettings.totalBlockMode),
      browserUser: String(currentSettings.browserUser || '')
    },
    releaseRequests: [],
    logs: []
  };
}

async function createServerHarness() {
  const serverDir = path.resolve(__dirname, '../../..');
  const backendPath = path.join(serverDir, 'backend', 'app.js');
  const dbDir = path.join(serverDir, 'database');
  const runtimeStatePath = path.join(dbDir, 'runtime-state.json');
  const logsDir = path.join(dbDir, 'logs');
  const backupRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'organife-server-test-'));
  const backupRuntimePath = path.join(backupRoot, 'runtime-state.json');
  const backupLogsDir = path.join(backupRoot, 'logs');

  const runtimeExisted = await exists(runtimeStatePath);
  if (runtimeExisted) {
    const runtimeRaw = await fs.promises.readFile(runtimeStatePath, 'utf8');
    await fs.promises.writeFile(backupRuntimePath, runtimeRaw, 'utf8');
  }
  await fs.promises.mkdir(backupLogsDir, { recursive: true });
  if (await exists(logsDir)) {
    await fs.promises.cp(logsDir, backupLogsDir, { recursive: true, force: true });
  }

  await fs.promises.mkdir(dbDir, { recursive: true });
  await fs.promises.mkdir(logsDir, { recursive: true });

  const originalState = await readJson(runtimeStatePath, {});
  const cleanState = normalizeState(originalState);
  await fs.promises.writeFile(runtimeStatePath, JSON.stringify(cleanState, null, 2), 'utf8');

  await fs.promises.rm(logsDir, { recursive: true, force: true });
  await fs.promises.mkdir(logsDir, { recursive: true });

  const port = uniquePort();
  const child = spawn('node', [backendPath], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForServerReady(child);

  async function cleanup() {
    await stopProcess(child);
    try {
      if (runtimeExisted && await exists(backupRuntimePath)) {
        const runtimeRaw = await fs.promises.readFile(backupRuntimePath, 'utf8');
        await fs.promises.writeFile(runtimeStatePath, runtimeRaw, 'utf8');
      } else if (!runtimeExisted) {
        await fs.promises.rm(runtimeStatePath, { force: true });
      }

      await fs.promises.rm(logsDir, { recursive: true, force: true });
      await fs.promises.mkdir(logsDir, { recursive: true });
      if (await exists(backupLogsDir)) {
        await fs.promises.cp(backupLogsDir, logsDir, { recursive: true, force: true });
      }
    } finally {
      await fs.promises.rm(backupRoot, { recursive: true, force: true });
    }
  }

  async function request(pathname, options = {}) {
    const baseUrl = `http://127.0.0.1:${port}`;
    return fetch(`${baseUrl}${pathname}`, options);
  }

  async function requestJson(pathname, payload, options = {}) {
    const nextHeaders = {
      'content-type': 'application/json',
      ...(options.headers || {})
    };
    const nextOptions = {
      ...options,
      method: 'POST',
      headers: nextHeaders,
      body: JSON.stringify(payload)
    };
    return request(pathname, {
      ...nextOptions
    });
  }

  async function loginDashboard() {
    const response = await requestJson('/dashboard/login', { username: 'admin', password: 'asdf' });
    const rawCookie = response.headers.get('set-cookie') || '';
    const cookie = rawCookie.split(';')[0];
    return { response, cookie };
  }

  return {
    request,
    requestJson,
    loginDashboard,
    sleep,
    cleanup
  };
}

module.exports = {
  createServerHarness
};
