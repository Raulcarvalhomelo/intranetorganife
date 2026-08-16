'use strict';

(function attachKanbanOverlay(root) {
  function getCore() {
    return root.KanbanAPI || null;
  }

  function normalizeCard(card, index) {
    const core = getCore();
    if (!core || !core.utils || typeof core.utils.normalizeTodo !== 'function') return null;
    return core.utils.normalizeTodo(Object.assign({}, card || {}, { text: card && (card.text || card.title) }), index || 0);
  }

  function validateCard(card) {
    const normalized = normalizeCard(card, 0);
    return Boolean(normalized && normalized.text && normalized.id);
  }

  function normalizeCards(cards) {
    return (Array.isArray(cards) ? cards : []).map(normalizeCard).filter(Boolean);
  }

  root.OrganifeKanbanOverlay = { normalizeCard, normalizeCards, validateCard };
  if (typeof module !== 'undefined') module.exports = { normalizeCard, normalizeCards, validateCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
