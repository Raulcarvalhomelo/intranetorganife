'use strict';

(function attachDashboardMonitoring(root) {
  function createDashboardMonitoring(socketFactory, handlers) {
    const config = handlers || {};
    let retryDelay = 1000;
    let retryTimer = null;
    let socket = null;
    function connect() {
      socket = socketFactory();
      socket.onopen = () => {
        retryDelay = 1000;
        socket.send(JSON.stringify({ type: 'hello', client: 'dashboard' }));
      };
      socket.onmessage = (event) => { if (typeof config.onMessage === 'function') config.onMessage(event); };
      socket.onclose = () => {
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
        if (typeof config.onClose === 'function') config.onClose();
      };
      socket.onerror = () => { try { socket.close(); } catch (error) {} };
    }
    function close() {
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) socket.close();
      socket = null;
    }
    return { connect, close };
  }
  root.OrganifeDashboardMonitoring = { createDashboardMonitoring };
  if (typeof module !== 'undefined') module.exports = { createDashboardMonitoring };
})(typeof globalThis !== 'undefined' ? globalThis : this);
