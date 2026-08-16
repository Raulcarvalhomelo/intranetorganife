'use strict';

const ORGANIFE_DB_NAME = 'organife-extension-db';
const ORGANIFE_DB_VERSION = 1;
const ORGANIFE_DB_STORE_NAME = 'activityLogs';
const ORGANIFE_DB_INDEX_TIMESTAMP = 'by_timestamp_ms';
const ORGANIFE_DB_INDEX_ACTION = 'by_action';

function getSchema() {
  return {
    name: ORGANIFE_DB_NAME,
    version: ORGANIFE_DB_VERSION,
    store: ORGANIFE_DB_STORE_NAME,
    keyPath: 'id',
    indexes: [ORGANIFE_DB_INDEX_TIMESTAMP, ORGANIFE_DB_INDEX_ACTION]
  };
}

function createActivityDb(indexedDBApi) {
  const api = indexedDBApi || (typeof indexedDB !== 'undefined' ? indexedDB : null);
  let databasePromise = null;

  function open() {
    if (databasePromise) return databasePromise;
    if (!api) return Promise.resolve(null);
    databasePromise = new Promise((resolve) => {
      try {
        const request = api.open(ORGANIFE_DB_NAME, ORGANIFE_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(ORGANIFE_DB_STORE_NAME)) {
            const store = db.createObjectStore(ORGANIFE_DB_STORE_NAME, { keyPath: 'id' });
            store.createIndex(ORGANIFE_DB_INDEX_TIMESTAMP, 'timestampMs', { unique: false });
            store.createIndex(ORGANIFE_DB_INDEX_ACTION, 'action', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (error) {
        resolve(null);
      }
    });
    return databasePromise;
  }

  function put(value) {
    return open().then((db) => new Promise((resolve) => {
      if (!db) { resolve(false); return; }
      const transaction = db.transaction(ORGANIFE_DB_STORE_NAME, 'readwrite');
      transaction.objectStore(ORGANIFE_DB_STORE_NAME).put(value);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    }));
  }

  function getAll() {
    return open().then((db) => new Promise((resolve) => {
      if (!db) { resolve([]); return; }
      const request = db.transaction(ORGANIFE_DB_STORE_NAME, 'readonly').objectStore(ORGANIFE_DB_STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => resolve([]);
    }));
  }

  function clear() {
    return open().then((db) => new Promise((resolve) => {
      if (!db) { resolve(false); return; }
      const transaction = db.transaction(ORGANIFE_DB_STORE_NAME, 'readwrite');
      transaction.objectStore(ORGANIFE_DB_STORE_NAME).clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    }));
  }

  return { open, put, getAll, clear, getSchema };
}

if (typeof globalThis !== 'undefined') globalThis.OrganifeActivityDb = { getSchema, createActivityDb };
if (typeof module !== 'undefined') module.exports = { getSchema, createActivityDb };
