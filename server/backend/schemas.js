'use strict';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value, fallback) {
  return value === undefined || value === null ? (fallback || '') : String(value);
}

function normalizeLogEvent(input) {
  const source = isPlainObject(input) ? input : {};
  const details = isPlainObject(source.details) ? source.details : {};
  return {
    id: Number.isFinite(Number(source.id)) ? Number(source.id) : Date.now(),
    timestamp: new Date(source.timestamp || Date.now()).toISOString(),
    windowsUser: asString(source.windowsUser || source.user_id),
    browserUser: asString(source.browserUser || source.user),
    browser: asString(source.browser || source.browserName),
    action: asString(source.action || source.type),
    details
  };
}

function validateLogEvent(input) {
  const event = normalizeLogEvent(input);
  return Boolean(event.timestamp && event.action);
}

function normalizeSettings(input) {
  const source = isPlainObject(input) ? input : {};
  return {
    blockedSites: Array.isArray(source.blockedSites) ? source.blockedSites : [],
    allowedDomains: Array.isArray(source.allowedDomains) ? source.allowedDomains : [],
    tempAllowedLinks: Array.isArray(source.tempAllowedLinks) ? source.tempAllowedLinks : [],
    blockedKeywords: Array.isArray(source.blockedKeywords) ? source.blockedKeywords : []
  };
}

module.exports = { isPlainObject, normalizeLogEvent, validateLogEvent, normalizeSettings };
