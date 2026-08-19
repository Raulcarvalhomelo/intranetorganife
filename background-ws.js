
function exponentialBackoff(previousDelay) {
  const current = Number(previousDelay) || 1000;
  return Math.min(current * 2, 30000);
}

function createWebSocketClient(options) {
  const config = options || {};
  const WebSocketClass = config.WebSocketClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const batchSize = Math.max(1, Number(config.batchSize) || 50);
  const flushIntervalMs = Math.max(1000, Number(config.flushIntervalMs) || 30000);
  const onMessage = typeof config.onMessage === 'function' ? config.onMessage : function () {};
  let queue = [];
  let batchTimer = null;
  let endpoint = '';

  function clearBatchTimer() {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = null;
  }

  function scheduleFlush() {
    if (batchTimer || !queue.length) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      flush();
    }, flushIntervalMs);
  }

  function flush() {
    const socket = transport.getSocket();
    if (!socket || socket.readyState !== 1 || !queue.length) {
      if (queue.length) scheduleFlush();
      return false;
    }
    const batch = queue.splice(0, batchSize);
    try {
      socket.send(JSON.stringify({ type: 'logs_batch', logs: batch }));
      if (queue.length) flush();
      return true;
    } catch (error) {
      queue = batch.concat(queue);
      try { socket.close(); } catch (closeError) {}
      scheduleFlush();
      return false;
    }
  }

  const transport = createWebSocketTransport({
    WebSocketClass,
    onOpen: (socket) => {
      socket.send(JSON.stringify({ type: 'hello', client: 'extension' }));
      flush();
    },
    onMessage: (event) => {
      let message = {};
      try { message = JSON.parse(String(event && event.data || '{}')); } catch (error) { return; }
      if (message.type === 'settings_state') onMessage({ type: 'settings', settings: message.payload || {} });
      else if (message.type === 'state_update') onMessage(message);
      else if (message.type === 'logs_ack') onMessage(message);
    },
    onClose: () => {
      if (queue.length) scheduleFlush();
    }
  });

  function setEndpoint(url) {
    endpoint = String(url || '').replace(/\/$/, '');
    transport.setEndpoint(endpoint.replace(/^http/i, 'ws') + '/ws');
  }

  function enqueue(logs) {
    const source = Array.isArray(logs) ? logs : [logs];
    queue = queue.concat(source.filter(Boolean));
    if (queue.length >= batchSize) flush();
    else scheduleFlush();
  }

  function close() {
    clearBatchTimer();
    transport.close();
  }

  return { setEndpoint, enqueue, flush, connect: transport.connect, close, getQueueLength: () => queue.length };
}

function createWebSocketTransport(options) {
  const config = options || {};
  const WebSocketClass = config.WebSocketClass || (typeof WebSocket !== 'undefined' ? WebSocket : null);
  const onOpen = typeof config.onOpen === 'function' ? config.onOpen : function () {};
  const onMessage = typeof config.onMessage === 'function' ? config.onMessage : function () {};
  const onClose = typeof config.onClose === 'function' ? config.onClose : function () {};
  const onError = typeof config.onError === 'function' ? config.onError : function () {};
  let socket = null;
  let retryTimer = null;
  let retryDelay = 1000;
  let endpoint = '';
  let manuallyClosed = false;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry() {
    clearRetry();
    if (manuallyClosed || !endpoint) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay);
    retryDelay = exponentialBackoff(retryDelay);
  }

  function connect() {
    clearRetry();
    if (manuallyClosed || !WebSocketClass || !endpoint) return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    try {
      const currentSocket = new WebSocketClass(endpoint);
      socket = currentSocket;
      currentSocket.onopen = () => {
        if (socket !== currentSocket) return;
        retryDelay = 1000;
        onOpen(currentSocket);
      };
      currentSocket.onmessage = (event) => {
        if (socket === currentSocket) onMessage(event);
      };
      currentSocket.onerror = (error) => {
        if (socket !== currentSocket) return;
        onError(error);
        try { currentSocket.close(); } catch (closeError) {}
      };
      currentSocket.onclose = () => {
        if (socket !== currentSocket) return;
        socket = null;
        onClose();
        scheduleRetry();
      };
    } catch (error) {
      socket = null;
      onError(error);
      scheduleRetry();
    }
  }

  function setEndpoint(url) {
    endpoint = String(url || '').replace(/\/$/, '');
    manuallyClosed = false;
    clearRetry();
    if (socket) {
      const previousSocket = socket;
      socket = null;
      onClose();
      try { previousSocket.close(); } catch (error) {}
    }
    connect();
  }

  function close() {
    manuallyClosed = true;
    clearRetry();
    if (socket) {
      const previousSocket = socket;
      socket = null;
      onClose();
      try { previousSocket.close(); } catch (error) {}
    }
  }

  function getSocket() {
    return socket;
  }

  return { setEndpoint, connect, close, getSocket, getState: () => (socket ? socket.readyState : (retryTimer ? 0 : 3)) };
}

if (typeof globalThis !== 'undefined') globalThis.OrganifeWebSocket = { exponentialBackoff, createWebSocketClient, createWebSocketTransport };
if (typeof module !== 'undefined') module.exports = { exponentialBackoff, createWebSocketClient, createWebSocketTransport };
