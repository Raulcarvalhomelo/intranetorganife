'use strict';

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
  let socket = null;
  let retryTimer = null;
  let batchTimer = null;
  let retryDelay = 1000;
  let endpoint = '';
  let queue = [];

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function clearBatchTimer() {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = null;
  }

  function scheduleRetry() {
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay);
    retryDelay = exponentialBackoff(retryDelay);
  }

  function scheduleFlush() {
    if (batchTimer || !queue.length) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      flush();
    }, flushIntervalMs);
  }

  function connect() {
    clearRetry();
    if (!WebSocketClass || !endpoint) return;
    try {
      socket = new WebSocketClass(endpoint);
      socket.onopen = () => {
        retryDelay = 1000;
        socket.send(JSON.stringify({ type: 'hello', client: 'extension' }));
        flush();
      };
      socket.onmessage = (event) => {
        let message = {};
        try { message = JSON.parse(String(event && event.data || '{}')); } catch (error) { return; }
        if (message.type === 'settings_state') onMessage({ type: 'settings', settings: message.payload || {} });
        else if (message.type === 'state_update') onMessage(message);
        else if (message.type === 'logs_ack') onMessage(message);
      };
      socket.onerror = () => {
        try { socket.close(); } catch (error) {}
      };
      socket.onclose = () => {
        socket = null;
        scheduleRetry();
      };
    } catch (error) {
      socket = null;
      scheduleRetry();
    }
  }

  function setEndpoint(url) {
    const normalized = String(url || '').replace(/\/$/, '');
    endpoint = normalized.replace(/^http/i, 'ws') + '/ws';
    if (socket) {
      try { socket.close(); } catch (error) {}
    } else connect();
  }

  function enqueue(logs) {
    const source = Array.isArray(logs) ? logs : [logs];
    queue = queue.concat(source.filter(Boolean));
    if (queue.length >= batchSize) flush();
    else scheduleFlush();
  }

  function flush() {
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
      return false;
    }
  }

  function close() {
    clearRetry();
    clearBatchTimer();
    if (socket) {
      try { socket.close(); } catch (error) {}
    }
    socket = null;
  }

  return { setEndpoint, enqueue, flush, connect, close, getQueueLength: () => queue.length };
}

if (typeof globalThis !== 'undefined') globalThis.OrganifeWebSocket = { exponentialBackoff, createWebSocketClient };
if (typeof module !== 'undefined') module.exports = { exponentialBackoff, createWebSocketClient };
