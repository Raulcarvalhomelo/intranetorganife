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
      const page = await logStore.readLogsPage({
        limit: Math.max(1, Math.min(100, Number(req.query.limit) || 50)),
        cursor: req.query.cursor,
        q: req.query.q,
        type: req.query.type,
        user: req.query.user,
        users: req.query.users,
        domain: req.query.domain,
        startTime: req.query.startTime,
        endTime: req.query.endTime,
        day: req.query.day
      });
      return res.json(page);
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-consultar-logs' });
    }
  }

  async function listLogUsers(req, res) {
    try {
      if (logStore && typeof logStore.flush === 'function') await logStore.flush();
      const rows = await logStore.readLogs({
        limit: 5000,
        day: req.query.day
      });
      const users = new Map();
      rows.forEach((row) => {
        const value = String(row.browserUser || row.windowsUser || row.user || row.user_id || '').trim();
        if (!value) return;
        const key = value.toLocaleLowerCase('pt-BR');
        if (!users.has(key)) users.set(key, value);
      });
      return res.json({ users: Array.from(users.values()).sort((left, right) => left.localeCompare(right, 'pt-BR')) });
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-consultar-usuarios' });
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
  router.get('/dashboard/api/logs/users', requireAuth, listLogUsers);

  return router;
}

module.exports = { createLogsRouter };
