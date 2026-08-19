'use strict';

const TYPE_DEFINITIONS = {
  navigation: { key: 'navigation', label: 'Navegação' },
  blocked: { key: 'blocked', label: 'Bloqueado' },
  download: { key: 'download', label: 'Download' },
  form_submit: { key: 'form_submit', label: 'Formulário' },
  documents: { key: 'documents', label: 'Documentos' }
};

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function normalizeValue(value) {
  return String(value !== undefined && value !== null ? value : '').trim();
}

function getEventUrl(event) {
  const item = asObject(event);
  const details = asObject(item.details);
  const data = asObject(item.data);
  const candidates = [item.url, details.url, data.url, item.href, details.href, data.href, item.originalUrl, details.originalUrl, data.originalUrl];
  for (let index = 0; index < candidates.length; index += 1) {
    const value = normalizeValue(candidates[index]);
    if (value) return value;
  }
  return '';
}

function getOriginalType(event) {
  const item = asObject(event);
  return normalizeValue(item.action || item.type || '').toLowerCase();
}

function cloneDefinition(definition, originalType, url) {
  return {
    key: definition.key,
    label: definition.label,
    originalType,
    url
  };
}

function classifyActivityType(event) {
  const originalType = getOriginalType(event);
  const url = getEventUrl(event);
  const protocol = url.toLowerCase();
  if (protocol.indexOf('file:///') === 0 || protocol.indexOf('blob:') === 0) return cloneDefinition(TYPE_DEFINITIONS.documents, originalType, url);
  if (protocol.indexOf('about:') === 0) return cloneDefinition(TYPE_DEFINITIONS.navigation, originalType, url);
  if (originalType === 'download') return cloneDefinition(TYPE_DEFINITIONS.download, originalType, url);
  if (originalType === 'blocked') return cloneDefinition(TYPE_DEFINITIONS.blocked, originalType, url);
  if (originalType === 'form_submit' || originalType === 'form-submit' || originalType === 'form') return cloneDefinition(TYPE_DEFINITIONS.form_submit, originalType, url);
  if (originalType === 'click' || originalType === 'access' || originalType === 'navigation' || !originalType) return cloneDefinition(TYPE_DEFINITIONS.navigation, originalType, url);
  return cloneDefinition(TYPE_DEFINITIONS.navigation, originalType, url);
}

function getTypeDefinitions() {
  return Object.keys(TYPE_DEFINITIONS).map((key) => ({ key, label: TYPE_DEFINITIONS[key].label }));
}

module.exports = {
  TYPE_DEFINITIONS,
  getEventUrl,
  classifyActivityType,
  getTypeDefinitions
};

