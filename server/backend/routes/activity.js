'use strict';

const express = require('express');
const { buildActivity } = require('../activity');

function createActivityRouter(options) {
  const config = options || {};
  const router = express.Router();
  const logStore = config.logStore;
  const requireAuth = config.requireAuth || function (req, res, next) { next(); };

  function normalizeLimit(value) {
    return Math.max(1, Math.min(5000, Number(value) || 2000));
  }

  function parseMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function inTimeRange(timestamp, start, end) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return false;
    const minutes = date.getHours() * 60 + date.getMinutes();
    if (start === null && end === null) return true;
    if (start !== null && end !== null && start > end) return minutes >= start || minutes <= end;
    if (start !== null && minutes < start) return false;
    if (end !== null && minutes > end) return false;
    return true;
  }

  function filterActivityRows(rows, query) {
    const domain = String(query.domain || '').trim().toLowerCase();
    const start = parseMinutes(query.startTime);
    const end = parseMinutes(query.endTime);
    return rows.filter((row) => {
      const details = row && row.details && typeof row.details === 'object' ? row.details : {};
      const rawDomain = String(details.domain || details.hostname || details.url || row.domain || row.url || '').toLowerCase();
      if (domain && rawDomain.indexOf(domain) < 0) return false;
      return inTimeRange(row.timestamp, start, end);
    });
  }

  async function readActivity(req, res) {
    try {
      if (logStore && typeof logStore.flush === 'function') await logStore.flush();
      const rows = await logStore.readLogs({
        limit: normalizeLimit(req.query.limit),
        q: req.query.q,
        type: req.query.type,
        user: req.query.user,
        day: req.query.day
      });
      return res.json(buildActivity(filterActivityRows(rows, req.query)));
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-calcular-atividade' });
    }
  }

  router.get('/dashboard/api/activity/summary', requireAuth, readActivity);
  router.get('/dashboard/api/activity/timeline', requireAuth, readActivity);
  return router;
}

module.exports = { createActivityRouter };
