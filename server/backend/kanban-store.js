'use strict';

function createKanbanStore(options) {
  const config = options || {};
  return {
    databasePath: config.databasePath || '',
    initialize: config.initialize || function () { return Promise.resolve(); },
    flush: config.flush || function () { return Promise.resolve(); }
  };
}

module.exports = { createKanbanStore };
