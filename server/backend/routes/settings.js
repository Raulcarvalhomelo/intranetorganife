'use strict';

const express = require('express');

function uniqueList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean)));
}

function mergeSettings(current, body) {
  const existing = current && typeof current === 'object' ? current : {};
  const source = body && typeof body === 'object' ? body : {};
  const next = Object.assign({}, existing, source);
  ['blockedKeywords', 'blockedSites', 'allowedLinks', 'allowedDomains', 'tempAllowedLinks'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = uniqueList(source[key]);
    else next[key] = uniqueList(existing[key]);
  });
  if (Object.prototype.hasOwnProperty.call(source, 'quickLinks')) {
    next.quickLinks = Array.isArray(source.quickLinks)
      ? source.quickLinks.map((entry) => ({
        name: String(entry && entry.name || '').trim(),
        url: String(entry && entry.url || '').trim()
      })).filter((entry) => entry.name && entry.url)
      : [];
  }
  return next;
}

function createSettingsRouter(options) {
  const config = options || {};
  const router = express.Router();
  const stateStore = config.stateStore;
  const emitUpdate = typeof config.emitUpdate === 'function' ? config.emitUpdate : function () {};
  const requireAuth = config.requireAuth || function (req, res, next) { next(); };
  const requireAdmin = config.requireAdmin || function (req, res, next) { next(); };

  function getSettings(req, res) {
    return res.json(stateStore.read().settings);
  }

  function saveSettings(req, res) {
    const state = stateStore.read();
    state.settings = mergeSettings(state.settings, req.body || {});
    stateStore.write(state);
    emitUpdate('settings');
    return res.json(state.settings);
  }

  router.get('/settings', getSettings);
  router.post('/settings', saveSettings);
  router.get('/dashboard/api/settings', requireAuth, requireAdmin, getSettings);
  router.post('/dashboard/api/settings', requireAuth, requireAdmin, saveSettings);

  return router;
}

module.exports = { createSettingsRouter, mergeSettings };
