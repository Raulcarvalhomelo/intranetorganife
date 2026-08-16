'use strict';

const express = require('express');

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (raw.indexOf('://') >= 0) return new URL(raw).hostname.toLowerCase();
  } catch (error) {}
  return raw.split('/')[0].split(':')[0].replace(/^www\./, '');
}

function uniqueList(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || '').trim()).filter(Boolean)));
}

function normalizeInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    clientRequestId: String(source.clientRequestId || source.client_request_id || '').trim(),
    domain: normalizeDomain(source.domain),
    reason: String(source.reason || source.motivo || '').trim(),
    user: String(source.user || source.browserUser || 'Desconhecido').trim() || 'Desconhecido',
    browser: String(source.browser || source.browserName || 'Desconhecido').trim() || 'Desconhecido',
    originalUrl: String(source.originalUrl || '').trim(),
    timestamp: String(source.timestamp || '').trim() || new Date().toISOString()
  };
}

function isPending(status) {
  const value = String(status || '').trim().toLowerCase();
  return !value || value === 'pendente' || value === 'pending';
}

function dedupKey(input) {
  const normalized = normalizeInput(input);
  if (normalized.clientRequestId) return `id:${normalized.clientRequestId}`;
  return `raw:${normalized.timestamp}|${normalized.domain}|${normalized.reason}|${normalized.user}|${normalized.originalUrl}`;
}

function upsertRequest(state, input) {
  const normalized = normalizeInput(input);
  if (!normalized.domain) return { error: 'domain-obrigatorio' };
  const requests = Array.isArray(state.releaseRequests) ? state.releaseRequests : [];
  const sameRequest = requests.find((entry) => dedupKey(entry) === dedupKey(normalized));
  if (sameRequest) return { item: sameRequest, created: false };
  const samePending = requests.find((entry) => isPending(entry.status)
    && normalizeDomain(entry.domain) === normalized.domain
    && String(entry.user || entry.browserUser || '').trim().toLowerCase() === normalized.user.toLowerCase());
  if (samePending) return { item: samePending, created: false };
  const item = Object.assign({ id: Date.now(), status: 'pendente' }, normalized);
  requests.unshift(item);
  state.releaseRequests = requests;
  state.settings.tempAllowedLinks = uniqueList((state.settings.tempAllowedLinks || []).concat([normalized.domain]));
  return { item, created: true };
}

function removeDomain(list, domain) {
  const target = normalizeDomain(domain);
  return (Array.isArray(list) ? list : []).filter((entry) => normalizeDomain(entry) !== target);
}

function createReleaseRouter(options) {
  const config = options || {};
  const router = express.Router();
  const stateStore = config.stateStore;
  const emitUpdate = typeof config.emitUpdate === 'function' ? config.emitUpdate : function () {};
  const requireAuth = config.requireAuth || function (req, res, next) { next(); };

  function create(req, res) {
    const state = stateStore.read();
    const result = upsertRequest(state, req.body || {});
    if (result.error) return res.status(400).json({ message: result.error });
    stateStore.write(state);
    emitUpdate('requests');
    return res.status(result.created ? 201 : 200).json({ status: 'pendente', request: result.item, duplicate: !result.created });
  }

  function list(req, res) {
    return res.json(stateStore.read().releaseRequests);
  }

  function approve(req, res) {
    return updateStatus(req, res, 'aprovado_admin');
  }

  function block(req, res) {
    return updateStatus(req, res, 'bloqueado_admin');
  }

  function updateStatus(req, res, status) {
    const state = stateStore.read();
    const id = String(req.params.id);
    const index = state.releaseRequests.findIndex((entry) => String(entry.id) === id);
    if (index < 0) return res.status(404).json({ message: 'solicitacao-nao-encontrada' });
    const item = state.releaseRequests[index];
    const domain = normalizeDomain(item.domain);
    item.status = status;
    if (status === 'bloqueado_admin') {
      state.settings.tempAllowedLinks = removeDomain(state.settings.tempAllowedLinks, domain);
      state.settings.allowedDomains = removeDomain(state.settings.allowedDomains, domain);
      state.settings.blockedSites = uniqueList((state.settings.blockedSites || []).concat([domain]));
    } else {
      state.settings.tempAllowedLinks = removeDomain(state.settings.tempAllowedLinks, domain);
      state.settings.blockedSites = removeDomain(state.settings.blockedSites, domain);
      state.settings.allowedDomains = uniqueList((state.settings.allowedDomains || []).concat([domain]));
    }
    stateStore.write(state);
    emitUpdate('requests');
    return res.json(item);
  }

  function listDashboard(req, res) {
    const user = String(req.query.user || '').trim().toLowerCase();
    const rows = stateStore.read().releaseRequests.filter((entry) => !user || String(entry.user || '').toLowerCase().indexOf(user) >= 0);
    return res.json(rows);
  }

  router.post('/release-requests', create);
  router.get('/release-requests', list);
  router.post('/release-requests/:id/block', block);
  router.post('/release-requests/:id/approve', approve);
  router.post('/api/request-release', create);
  router.get('/dashboard/api/release-requests', requireAuth, listDashboard);
  router.post('/dashboard/api/release-requests/:id/block', requireAuth, block);
  router.post('/dashboard/api/release-requests/:id/approve', requireAuth, approve);

  return router;
}

module.exports = { createReleaseRouter, normalizeDomain, upsertRequest };
