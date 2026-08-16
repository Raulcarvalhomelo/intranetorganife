'use strict';

const express = require('express');
const { normalizeLogEvent, validateLogEvent } = require('../schemas');

function createLogsRouter(options) {
  const config = options || {};
  const router = express.Router();
  const logStore = config.logStore;
  const emitUpdate = typeof config.emitUpdate === 'function' ? config.emitUpdate : function () {};
  const requireAuth = config.requireAuth || function (req, res, next) { next(); };

  function createLog(req, res) {
    const input = Object.assign({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString() }, req.body || {});
    if (!validateLogEvent(input)) return res.status(400).json({ message: 'evento-de-log-invalido' });
    const item = normalizeLogEvent(input);
    logStore.queueLogs([item]);
    emitUpdate('logs');
    return res.status(201).json(item);
  }

  async function listLogs(req, res) {
    try {
      const rows = await logStore.readLogs({
        limit: Math.max(1, Math.min(5000, Number(req.query.limit) || 200)),
        q: req.query.q,
        type: req.query.type,
        user: req.query.user,
        day: req.query.day
      });
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-consultar-logs' });
    }
  }

  function logAccess(req, res) {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const detailsSource = payload.details && typeof payload.details === 'object' ? payload.details : {};
    const dataSource = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const url = String(payload.url || payload.originalUrl || payload.href || detailsSource.url || detailsSource.href || dataSource.url || dataSource.href || '').trim();
    const title = String(payload.title || detailsSource.title || dataSource.title || '').trim();
    return createLog({
      body: Object.assign({}, payload, {
        type: 'access',
        browserUser: String(payload.browserUser || payload.user_id || '').trim(),
        browser: String(payload.browser || 'Desconhecido').trim() || 'Desconhecido',
        details: Object.assign({}, detailsSource, dataSource, url ? { url } : {}, title ? { title } : {})
      })
    }, res);
  }

  router.post('/logs', createLog);
  router.get('/logs', listLogs);
  router.post('/api/log-access', logAccess);
  router.get('/dashboard/api/logs', requireAuth, listLogs);
  router.get('/dashboard/api/logs/by-user-day', requireAuth, listLogs);

  return router;
}

module.exports = { createLogsRouter };
