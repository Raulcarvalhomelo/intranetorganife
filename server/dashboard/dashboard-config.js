'use strict';

(function attachDashboardConfig(root) {
  function createDashboardConfig(api) {
    return {
      load: () => api('/config'),
      save: (payload) => api('/config', { method: 'POST', body: JSON.stringify(payload) })
    };
  }
  root.OrganifeDashboardConfig = { createDashboardConfig };
  if (typeof module !== 'undefined') module.exports = { createDashboardConfig };
})(typeof globalThis !== 'undefined' ? globalThis : this);
