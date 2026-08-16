'use strict';

(function attachDashboardLogs(root) {
  function createDashboardLogs(api) {
    return {
      list: (query) => api(`/logs${query || ''}`),
      listByUserDay: (query) => api(`/logs/by-user-day${query || ''}`)
    };
  }
  root.OrganifeDashboardLogs = { createDashboardLogs };
  if (typeof module !== 'undefined') module.exports = { createDashboardLogs };
})(typeof globalThis !== 'undefined' ? globalThis : this);
