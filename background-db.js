'use strict';

const LOGS_DB_NAME = 'organife-extension-db';
const LOGS_DB_VERSION = 1;
const LOGS_STORE_NAME = 'activityLogs';

function getSchema() {
  return { name: LOGS_DB_NAME, version: LOGS_DB_VERSION, store: LOGS_STORE_NAME, keyPath: 'id' };
}

if (typeof module !== 'undefined') module.exports = { getSchema };
