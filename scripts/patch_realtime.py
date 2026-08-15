from pathlib import Path

root = Path('/home/ubuntu/intranetorganife')
app_path = root / 'server/backend/app.js'
text = app_path.read_text()
text = text.replace("const { read, write } = require('./state');\n", "const { read, write } = require('./state');\nconst { createRealtimeServer } = require('./realtime');\n")
text = text.replace("const sseClients = new Set();\nconst dashboardSseClients = new Set();\n", "let realtimeServer = null;\n")
old = """function emitUpdate(kind = 'all', extra = null) {
  const basePayload = { updated: true, kind, at: new Date().toISOString() };
  const mergedPayload = extra && typeof extra === 'object'
    ? { ...basePayload, ...extra }
    : basePayload;
  const payload = `data: ${JSON.stringify(mergedPayload)}\\n\\n`;
  sseClients.forEach((res) => res.write(payload));
  dashboardSseClients.forEach((res) => res.write(payload));
}
"""
new = """function emitUpdate(kind = 'all', extra = null) {
  const basePayload = { updated: true, kind, at: new Date().toISOString() };
  const mergedPayload = extra && typeof extra === 'object'
    ? { ...basePayload, ...extra }
    : basePayload;
  if (realtimeServer) realtimeServer.broadcast({ type: 'state_update', payload: mergedPayload });
}
"""
if old not in text:
    raise SystemExit('emitUpdate block not found')
text = text.replace(old, new)
old_sse = """app.get('/settings/updates', (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Content-Type': 'text/event-stream' });
  res.flushHeaders();
  const client = res;
  sseClients.add(client);
  client.write(`data: ${JSON.stringify({ updated: true, kind: 'bootstrap', at: new Date().toISOString() })}\\n\\n`);
  req.on('close', () => sseClients.delete(client));
});
app.get('/dashboard/updates', requireDashboardAuth, (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Content-Type': 'text/event-stream' });
  res.flushHeaders();
  const client = res;
  dashboardSseClients.add(client);
  client.write(`data: ${JSON.stringify({ updated: true, kind: 'bootstrap', at: new Date().toISOString() })}\\n\\n`);
  req.on('close', () => dashboardSseClients.delete(client));
});
"""
if old_sse in text:
    text = text.replace(old_sse, '')
else:
    print('SSE route block not found; continuing')
old_tail = """  .finally(() => {
    app.listen(port, '0.0.0.0', () => {
      process.stdout.write(`Server running on http://0.0.0.0:${port}\\n`);
    });
  });
"""
new_tail = """  .finally(() => {
    const http = require('http');
    const httpServer = http.createServer(app);
    realtimeServer = createRealtimeServer(httpServer, {
      onMessage: (socket, message) => {
        if (message.type === 'logs_batch' && Array.isArray(message.logs)) {
          message.logs.forEach((item) => queueLog(item));
          realtimeServer.send(socket, { type: 'logs_ack', count: message.logs.length });
          emitUpdate('logs');
        }
      }
    });
    httpServer.listen(port, '0.0.0.0', () => {
      process.stdout.write(`Server running on http://0.0.0.0:${port}\\n`);
    });
  });
"""
if old_tail not in text:
    raise SystemExit('server tail not found')
text = text.replace(old_tail, new_tail)
app_path.write_text(text)

bg_path = root / 'background.js'
bg = bg_path.read_text()
start = bg.index('let settingsEventSource = null;')
end = bg.index("browserAPI.storage.onChanged.addListener", start)
replacement = """let settingsWebSocket = null;
let wsRetryTimer = null;
let wsRetryDelay = 1000;
function setupWebSocket() {
  if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null; }
  if (settingsWebSocket) { try { settingsWebSocket.close(); } catch (error) {} }
  settingsWebSocket = null;
  if (!serverUrl || typeof WebSocket !== 'function') return;
  try {
    const wsUrl = `${String(serverUrl).replace(/^http/, 'ws').replace(/\\/$/, '')}/ws`;
    settingsWebSocket = new WebSocket(wsUrl);
    settingsWebSocket.onopen = () => {
      wsRetryDelay = 1000;
      settingsWebSocket.send(JSON.stringify({ type: 'hello', client: 'extension' }));
    };
    settingsWebSocket.onmessage = async (event) => {
      let message = {};
      try { message = JSON.parse(String(event.data || '{}')); } catch (error) { return; }
      const payload = message.payload || {};
      if (!payload.updated) return;
      if (String(payload.kind || '').toLowerCase() === 'kanban' && String(payload.channel || '').toLowerCase() === 'kanban') {
        await storageLocalSetAsync({ [KANBAN_REALTIME_DELTA_KEY]: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload } });
        return;
      }
      await loadSettingsFromServer();
    };
    settingsWebSocket.onerror = () => { try { settingsWebSocket.close(); } catch (error) {} };
    settingsWebSocket.onclose = () => {
      settingsWebSocket = null;
      wsRetryTimer = setTimeout(setupWebSocket, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 2, 30000);
    };
  } catch (error) {
    wsRetryTimer = setTimeout(setupWebSocket, wsRetryDelay);
    wsRetryDelay = Math.min(wsRetryDelay * 2, 30000);
  }
}
"""
bg = bg[:start] + replacement + bg[end:]
bg = bg.replace('setupSSE();', 'setupWebSocket();')
bg_path.write_text(bg)

dash_path = root / 'server/dashboard/app.js'
dash = dash_path.read_text()
dash = dash.replace("""  const es = new EventSource('/dashboard/updates');
  es.onmessage = () => {
    void loadAll();
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectRealtime, 3000);
  };
""", """  if (window.dashboardSocket) { try { window.dashboardSocket.close(); } catch (error) {} }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  window.dashboardSocket = socket;
  socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', client: 'dashboard' }));
  socket.onmessage = (event) => {
    let message = {};
    try { message = JSON.parse(event.data || '{}'); } catch (error) { return; }
    if (message.type === 'state_update') void loadAll();
  };
  socket.onclose = () => setTimeout(connectRealtime, 1000);
""")
dash_path.write_text(dash)

(root / 'sse.js').write_text("'use strict';\n// Deprecated: realtime communication is exclusively handled by /ws.\n")
(root / 'sse.html').write_text('<!doctype html><meta charset="utf-8"><title>Realtime</title><p>Realtime communication uses WebSocket.</p>\n')
