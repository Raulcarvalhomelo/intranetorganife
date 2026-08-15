from pathlib import Path

root = Path('/home/ubuntu/intranetorganife')
app_path = root / 'server/backend/app.js'
text = app_path.read_text()
start = text.index("app.get('/settings/updates'")
end = text.index("app.post('/release-requests'", start)
text = text[:start] + text[end:]
app_path.write_text(text)

dash_path = root / 'server/dashboard/app.js'
dash = dash_path.read_text()
start = dash.index('function initRealtime() {')
end = dash.index('async function boot()', start)
replacement = """function initRealtime() {
  let retryDelay = 1000;
  let retryTimer = null;
  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    window.dashboardSocket = socket;
    socket.onopen = () => {
      retryDelay = 1000;
      sseBadge.textContent = 'WebSocket online';
      sseBadge.classList.remove('offline');
      sseBadge.classList.add('online');
      socket.send(JSON.stringify({ type: 'hello', client: 'dashboard' }));
    };
    socket.onmessage = async (event) => {
      let message = {};
      try { message = JSON.parse(event.data || '{}'); } catch (error) { return; }
      const eventData = message.payload || {};
      if (message.type !== 'state_update') return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        let nextStatus = 'Atualizado em tempo real';
        if (isViewerSession()) {
          if (eventData.kind !== 'logs') await loadRequests();
          else nextStatus = 'Novos logs disponíveis. Clique em "Puxar logs"';
        } else if (eventData.kind === 'settings') {
          await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
        } else if (eventData.kind === 'requests') {
          await Promise.all([loadRequests(), loadSettings()]);
        } else if (eventData.kind === 'logs') {
          nextStatus = 'Novos logs disponíveis. Clique em "Puxar logs"';
        } else {
          await Promise.all([loadSettings(), loadConfig(), loadRequests()]);
        }
        statusEl.textContent = nextStatus;
      }, 150);
    };
    socket.onerror = () => { try { socket.close(); } catch (error) {} };
    socket.onclose = () => {
      sseBadge.textContent = 'WebSocket offline';
      sseBadge.classList.remove('online');
      sseBadge.classList.add('offline');
      statusEl.textContent = 'Conexão em tempo real instável';
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    };
  }
  if (retryTimer) clearTimeout(retryTimer);
  connect();
}
"""
dash = dash[:start] + replacement + dash[end:]
dash_path.write_text(dash)
