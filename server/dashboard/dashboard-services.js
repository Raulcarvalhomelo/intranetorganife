'use strict';

(function attachDashboardServices(root) {
  function createAuthService(api) {
    return {
      loadSession: () => api('/session'),
      isViewer: (session) => Boolean(session && session.role === 'viewer'),
      canEdit: (session) => Boolean(session && session.role === 'admin')
    };
  }

  function createLogsService(api) {
    return {
      list: (query) => api(`/logs${query || ''}`),
      listByUserDay: (query) => api(`/logs/by-user-day${query || ''}`)
    };
  }

  function createMonitoringService(socketFactory, handlers) {
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
      socket.onmessage = (event) => config.onMessage(event);
      socket.onclose = () => {
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
        if (typeof config.onClose === 'function') config.onClose();
      };
      socket.onerror = () => {
        try { socket.close(); } catch (error) {}
      };
    }
    return { connect, close: () => { if (retryTimer) clearTimeout(retryTimer); if (socket) socket.close(); } };
  }

  function createConfigService(api) {
    return {
      load: () => api('/config'),
      save: (payload) => api('/config', { method: 'POST', body: JSON.stringify(payload) })
    };
  }

  root.OrganifeDashboardServices = {
    createAuthService,
    createLogsService,
    createMonitoringService,
    createConfigService
  };
  if (typeof module !== 'undefined') module.exports = root.OrganifeDashboardServices;
})(typeof globalThis !== 'undefined' ? globalThis : this);
