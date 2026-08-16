'use strict';

const express = require('express');

function createKanbanRouter(options) {
  const config = options || {};
  const router = express.Router();
  const kanbanStore = config.kanbanStore;
  const normalizeCard = config.normalizeCard || kanbanStore.normalizeCard;
  const emitUpdate = typeof config.emitUpdate === 'function' ? config.emitUpdate : function () {};

  function cardPayload(card) {
    return {
      id: String(card.id || ''),
      title: String(card.title || ''),
      description: String(card.description || ''),
      status: String(card.status || 'todo'),
      priority: String(card.priority || 'med'),
      due_at: Number(card.dueAt) || 0,
      tags: parseArray(card.tagsJson),
      attachments: parseArray(card.attachmentsJson),
      depends_on: parseArray(card.dependsOnJson),
      sprint_id: String(card.sprintId || ''),
      assigned_to: card.assignedTo || null,
      departments: Array.isArray(card.departments) ? card.departments.map((entry) => entry.label || entry) : [],
      created_at: Number(card.createdAt) || Date.now(),
      updated_at: Number(card.updatedAt) || Date.now(),
      deleted: Number(card.deleted) ? 1 : 0
    };
  }

  function parseArray(value) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  async function saveCard(req, res) {
    const card = normalizeCard(req.body, Date.now());
    if (!card) return res.status(400).json({ message: 'card-invalido' });
    if (!card.deleted && !card.departments.length) return res.status(400).json({ message: 'departamento-obrigatorio' });
    try {
      await kanbanStore.upsertCard(card);
      emitUpdate('kanban', {
        channel: 'kanban',
        action: card.deleted ? 'delete' : 'upsert',
        card: cardPayload(card)
      });
      return res.status(201).json({ saved: true, id: card.id, updated_at: card.updatedAt });
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-salvar-card' });
    }
  }

  async function saveBatch(req, res) {
    const cards = Array.isArray(req.body && req.body.cards) ? req.body.cards : [];
    if (!cards.length) return res.status(400).json({ message: 'cards-obrigatorio' });
    const saved = [];
    const updated = [];
    try {
      for (let index = 0; index < cards.length; index += 1) {
        const card = normalizeCard(cards[index], Date.now());
        if (!card || (!card.deleted && !card.departments.length)) continue;
        await kanbanStore.upsertCard(card);
        saved.push({ id: card.id, updated_at: card.updatedAt });
        updated.push(cardPayload(card));
      }
      if (updated.length) emitUpdate('kanban', { channel: 'kanban', action: 'batch', cards: updated });
      return res.status(201).json({ saved: true, count: saved.length, cards: saved });
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-salvar-cards' });
    }
  }

  async function listCards(req, res) {
    const department = String(req.query.department || '').trim();
    if (!department) return res.status(400).json({ message: 'departamento-obrigatorio' });
    try {
      return res.json({ cards: await kanbanStore.listByDepartment(department) });
    } catch (error) {
      return res.status(500).json({ message: 'erro-ao-consultar-cards' });
    }
  }

  router.post('/api/kanban/card', saveCard);
  router.post('/api/kanban/cards/batch', saveBatch);
  router.get('/api/kanban/cards', listCards);
  return router;
}

module.exports = { createKanbanRouter };
