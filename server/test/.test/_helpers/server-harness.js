const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

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

function waitForServerReady(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderrBuffer = '';
    let stdoutBuffer = '';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout aguardando servidor iniciar. stderr=${stderrBuffer}`));
    }, timeoutMs);

    const onData = (chunk) => {
      const text = String(chunk || '');
      stdoutBuffer += text;
      if (stdoutBuffer.includes('Server running on')) {
        if (settled) return;
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

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.stderr.off('data', onErrData);
      child.off('exit', onExit);
    };

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
      dashboardPassword: 'asdf',
      dashboardViewerPassword: 'zzzz'
    },
    settings: {
      adminPassword: String(currentSettings.adminPassword || ''),
      restrictedPassword: String(currentSettings.restrictedPassword || ''),
      tempPassword: String(currentSettings.tempPassword || ''),
      companyName: String(currentSettings.companyName || 'Organife'),
      companyNotice: String(currentSettings.companyNotice || ''),
      serverUrl: String(currentSettings.serverUrl || 'http://localhost:1337'),
      quickLinks: Array.isArray(currentSettings.quickLinks) ? currentSettings.quickLinks : [],
      blockedKeywords: Array.isArray(currentSettings.blockedKeywords) ? currentSettings.blockedKeywords : [],
      blockedSites: Array.isArray(currentSettings.blockedSites) ? currentSettings.blockedSites : [],
      allowedLinks: Array.isArray(currentSettings.allowedLinks) ? currentSettings.allowedLinks : [],
      allowedDomains: Array.isArray(currentSettings.allowedDomains) ? currentSettings.allowedDomains : [],
      tempAllowedLinks: Array.isArray(currentSettings.tempAllowedLinks) ? currentSettings.tempAllowedLinks : [],
      totalBlockMode: Boolean(currentSettings.totalBlockMode),
      browserUser: String(currentSettings.browserUser || '')
    },
    releaseRequests: Array.isArray(current.releaseRequests) ? current.releaseRequests : [],
    logs: []
  };
}

async function createServerHarness() {
  const serverDir = path.resolve(__dirname, '../../..');
  const backendPath = path.join(serverDir, 'backend', 'app.js');
  const dbDir = path.join(serverDir, 'database');
  const runtimeStatePath = path.join(dbDir, 'runtime-state.json');
  const logsDir = path.join(dbDir, 'logs');
  const kanbanDbPath = path.join(dbDir, 'kanban.db');

  const backupRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'organife-server-test-'));
  const backupRuntimePath = path.join(backupRoot, 'runtime-state.json');
  const backupLogsDir = path.join(backupRoot, 'logs');
  const backupKanbanPath = path.join(backupRoot, 'kanban.db');

  const runtimeExisted = await exists(runtimeStatePath);
  if (runtimeExisted) {
    const runtimeRaw = await fs.promises.readFile(runtimeStatePath, 'utf8');
    await fs.promises.writeFile(backupRuntimePath, runtimeRaw, 'utf8');
  }

  await fs.promises.mkdir(backupLogsDir, { recursive: true });
  if (await exists(logsDir)) {
    await fs.promises.cp(logsDir, backupLogsDir, { recursive: true, force: true });
  }

  const kanbanExisted = await exists(kanbanDbPath);
  if (kanbanExisted) {
    const rawDb = await fs.promises.readFile(kanbanDbPath);
    await fs.promises.writeFile(backupKanbanPath, rawDb);
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
      PORT: String(port),
      LOG_FLUSH_INTERVAL_MS: '200'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServerReady(child);
  } catch (error) {
    await stopProcess(child);
    throw error;
  }

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

      if (kanbanExisted && await exists(backupKanbanPath)) {
        const rawDb = await fs.promises.readFile(backupKanbanPath);
        await fs.promises.writeFile(kanbanDbPath, rawDb);
      } else if (!kanbanExisted) {
        await fs.promises.rm(kanbanDbPath, { force: true });
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
    return request(pathname, {
      ...options,
      method: 'POST',
      headers: nextHeaders,
      body: JSON.stringify(payload)
    });
  }

  async function loginDashboard(username = 'admin', password = 'asdf') {
    const response = await requestJson('/dashboard/login', { username, password });
    const rawCookie = response.headers.get('set-cookie') || '';
    const cookie = rawCookie.split(';')[0];
    return { response, cookie };
  }

  return {
    request,
    requestJson,
    loginDashboard,
    cleanup
  };
}

module.exports = {
  createServerHarness
};
