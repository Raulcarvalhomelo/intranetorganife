'use strict';

(function attachDashboardAuth(root) {
  function createDashboardAuth(api) {
    return {
      loadSession: () => api('/session'),
      isViewer: (session) => Boolean(session && session.role === 'viewer'),
      canEdit: (session) => Boolean(session && session.role === 'admin')
    };
  }
  root.OrganifeDashboardAuth = { createDashboardAuth };
  if (typeof module !== 'undefined') module.exports = { createDashboardAuth };
})(typeof globalThis !== 'undefined' ? globalThis : this);
