'use strict';

function createAuthService(options) {
  const config = options || {};
  function isAdmin(role) { return String(role || '') === 'admin'; }
  function canRead(role) { return String(role || '') === 'admin' || String(role || '') === 'viewer'; }
  function canWrite(role) { return isAdmin(role); }
  return { isAdmin, canRead, canWrite, sessionTtlMs: config.sessionTtlMs || 1000 * 60 * 60 * 12 };
}

module.exports = { createAuthService };
