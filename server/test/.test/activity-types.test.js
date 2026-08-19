'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyActivityType, getEventUrl, getTypeDefinitions } = require('../../backend/activity-types');

test('classifica file:/// como Documentos', () => {
  const result = classifyActivityType({ type: 'navigation', url: 'file:///M:/Trabalho/relatorio-ra.html' });
  assert.equal(result.key, 'documents');
  assert.equal(result.label, 'Documentos');
});

test('classifica blob: como Documentos', () => {
  const result = classifyActivityType({ type: 'navigation', details: { url: 'blob:https://example.com/documento' } });
  assert.equal(result.key, 'documents');
  assert.equal(result.label, 'Documentos');
});

test('classifica about: como Navegação', () => {
  const result = classifyActivityType({ type: 'navigation', data: { url: 'about:blank' } });
  assert.equal(result.key, 'navigation');
  assert.equal(result.label, 'Navegação');
});

test('normaliza os tipos técnicos para rótulos amigáveis', () => {
  assert.equal(classifyActivityType({ type: 'navigation' }).label, 'Navegação');
  assert.equal(classifyActivityType({ type: 'blocked' }).label, 'Bloqueado');
  assert.equal(classifyActivityType({ type: 'download' }).label, 'Download');
  assert.equal(classifyActivityType({ type: 'form_submit' }).label, 'Formulário');
  assert.equal(classifyActivityType({ type: 'click' }).label, 'Navegação');
  assert.equal(classifyActivityType({ type: 'access' }).label, 'Navegação');
});

test('prioriza URL de detalhes e preserva a URL original na classificação', () => {
  const event = { type: 'navigation', url: '', details: { url: 'FILE:///M:/Trabalho/relatorio.pdf' } };
  assert.equal(getEventUrl(event), 'FILE:///M:/Trabalho/relatorio.pdf');
  assert.equal(classifyActivityType(event).key, 'documents');
});

test('expõe somente o catálogo público planejado', () => {
  assert.deepEqual(getTypeDefinitions(), [
    { key: 'navigation', label: 'Navegação' },
    { key: 'blocked', label: 'Bloqueado' },
    { key: 'download', label: 'Download' },
    { key: 'form_submit', label: 'Formulário' },
    { key: 'documents', label: 'Documentos' }
  ]);
});

