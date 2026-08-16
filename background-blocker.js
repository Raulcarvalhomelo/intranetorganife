'use strict';

(function attachOrganifeBlocker(root) {
  function getHost(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    try {
      const parsed = new URL(raw.indexOf('://') >= 0 ? raw : `https://${raw}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch (error) {
      return raw.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
    }
  }

  function matchesComCountryVariant(host, base) {
    if (base.indexOf('.com') !== base.length - 4) return false;
    if (host.indexOf(`${base}.`) !== 0) return false;
    return /^[a-z]{2,}(\.[a-z]{2,})*$/.test(host.slice(base.length + 1));
  }

  function compilePattern(pattern) {
    const value = String(pattern || '').trim().toLowerCase();
    if (!value) return null;
    const escaped = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return { raw: value, base: value.indexOf('*.') === 0 ? value.slice(2) : value, regex: new RegExp(`^${escaped}$`, 'i') };
  }

  function matchesPattern(host, matcher) {
    return Boolean(matcher && (matcher.regex.test(host) || host === matcher.base || host.endsWith(`.${matcher.base}`) || matchesComCountryVariant(host, matcher.base)));
  }

  function buildMatchers(list) {
    const result = [];
    (Array.isArray(list) ? list : []).forEach((entry) => {
      String(entry || '').split(';').map((value) => value.trim()).filter(Boolean).forEach((part) => {
        const matcher = compilePattern(part);
        if (matcher) result.push(matcher);
      });
    });
    return result;
  }

  function createBlocker(options) {
    const config = options || {};
    let state = Object.assign({
      blockedSites: [],
      allowedDomains: [],
      tempAllowedLinks: [],
      allowedLinks: [],
      blockedKeywords: [],
      totalBlockMode: false,
      browserUser: ''
    }, config.state || {});
    let temporaryAllowed = new Map();
    let matchers = { blocked: [], allowed: [], temporary: [] };

    function rebuild() {
      matchers = {
        blocked: buildMatchers(state.blockedSites),
        allowed: buildMatchers(state.allowedDomains),
        temporary: buildMatchers(state.tempAllowedLinks)
      };
    }

    function setState(next) {
      state = Object.assign({}, state, next || {});
      rebuild();
    }

    function isFreeWindow() {
      if (typeof config.isFreeWindow === 'function') return Boolean(config.isFreeWindow());
      return false;
    }

    function shouldBlock(url) {
      const normalizedUrl = String(url || '').toLowerCase();
      const host = getHost(normalizedUrl);
      if (!host || isFreeWindow()) return false;
      const expiry = temporaryAllowed.get(normalizedUrl);
      if (expiry && Date.now() < expiry) return false;
      if (expiry) temporaryAllowed.delete(normalizedUrl);
      if ((state.allowedLinks || []).some((entry) => normalizedUrl.indexOf(String(entry || '').toLowerCase()) >= 0)) return false;
      if (matchers.blocked.some((matcher) => normalizedUrl.indexOf(matcher.raw) >= 0 || matchesPattern(host, matcher))) return true;
      if (matchers.allowed.some((matcher) => matchesPattern(host, matcher))) return false;
      if (matchers.temporary.some((matcher) => normalizedUrl.indexOf(matcher.raw) >= 0 || matchesPattern(host, matcher))) return false;
      if (state.totalBlockMode) return true;
      return (state.blockedKeywords || []).some((keyword) => normalizedUrl.indexOf(String(keyword || '').toLowerCase()) >= 0);
    }

    function allowTemporarily(url, expiresAt) {
      temporaryAllowed.set(String(url || '').toLowerCase(), Number(expiresAt) || Date.now());
    }

    rebuild();
    return { getHost, setState, rebuild, shouldBlock, allowTemporarily };
  }

  root.OrganifeBlocker = { createBlocker, getHost, buildMatchers };
  if (typeof module !== 'undefined') module.exports = { createBlocker, getHost, buildMatchers };
})(typeof globalThis !== 'undefined' ? globalThis : this);
