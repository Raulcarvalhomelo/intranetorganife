'use strict';

/* MV3 service-worker boundary. The runtime implementation remains in background.js
 * until a manifest-safe bundling step is introduced; no EventSource is used. */
function exponentialBackoff(previousDelay) {
  const current = Number(previousDelay) || 1000;
  return Math.min(current * 2, 30000);
}

if (typeof module !== 'undefined') module.exports = { exponentialBackoff };
