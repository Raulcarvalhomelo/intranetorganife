'use strict';

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
let KanbanCore = null;
try { KanbanCore = require('../../kanban-core.js'); } catch (error) { KanbanCore = null; }

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, maxLength) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 500);
}

function departmentSlug(value) {
  return text(value, 80)
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function timestamp(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return fallback === undefined ? Date.now() : fallback;
}

function jsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function normalizeDepartments(input, legacy) {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set();
  const result = [];
  source.concat([legacy]).forEach((value) => {
    const label = text(value, 80);
    const slug = departmentSlug(label);
    if (!label || !slug || seen.has(slug)) return;
    seen.add(slug);
    result.push({ label, slug });
  });
  return result;
}

function normalizeCard(input, fallbackUpdatedAt) {
  const rawSource = isObject(input) ? input : {};
  const coreTodo = KanbanCore && KanbanCore.utils && typeof KanbanCore.utils.normalizeTodo === 'function'
    ? KanbanCore.utils.normalizeTodo(Object.assign({}, rawSource, { text: rawSource.text || rawSource.title }), 0)
    : null;
  const source = coreTodo
    ? Object.assign({}, rawSource, {
      title: coreTodo.text,
      text: coreTodo.text,
      status: coreTodo.status,
      priority: coreTodo.priority,
      departments: coreTodo.departments,
      department: coreTodo.department,
      dueAt: coreTodo.dueAt,
      tags: coreTodo.tags,
      attachments: coreTodo.attachments,
      description: coreTodo.description,
      sprintId: coreTodo.sprintId,
      recurrence: coreTodo.recurrence,
      createdAt: coreTodo.createdAt
    })
    : rawSource;
  const id = text(source.id, 120);
  if (!id) return null;
  const updatedAt = timestamp(
    source.updated_at !== undefined ? source.updated_at : source.updatedAt,
    fallbackUpdatedAt || Date.now()
  );
  const createdAt = timestamp(
    source.created_at !== undefined ? source.created_at : source.createdAt,
    updatedAt
  );
  const statusValue = text(source.status, 20).toLowerCase();
  const priorityValue = text(source.priority, 20).toLowerCase();
  const dueAt = timestamp(
    source.due_at !== undefined ? source.due_at : source.dueAt,
    0
  );
  const dependsSource = source.depends_on !== undefined ? source.depends_on : source.dependsOn;
  const dependsOn = Array.isArray(dependsSource)
    ? dependsSource.map((value) => text(value, 120)).filter((value, index, list) => value && value !== id && list.indexOf(value) === index).slice(0, 20)
    : [];
  const assignedSource = source.assigned_to !== undefined ? source.assigned_to : source.assignedTo;
  return {
    id,
    title: text(source.title || source.text, 200),
    description: text(source.description, 2000),
    status: ['backlog', 'todo', 'doing', 'done'].includes(statusValue) ? statusValue : 'todo',
    priority: ['low', 'med', 'high', 'urgent'].includes(priorityValue) ? priorityValue : 'med',
    dueAt: Number.isFinite(dueAt) ? dueAt : 0,
    tagsJson: JSON.stringify(jsonArray(source.tags)),
    attachmentsJson: JSON.stringify(jsonArray(source.attachments)),
    dependsOnJson: JSON.stringify(dependsOn),
    sprintId: text(source.sprint_id !== undefined ? source.sprint_id : source.sprintId, 80),
    assignedTo: text(assignedSource, 80) || null,
    recurrenceJson: JSON.stringify(isObject(source.recurrence) ? source.recurrence : { type: 'none', lastTrigger: 0 }),
    createdAt,
    updatedAt,
    deleted: Number(source.deleted) === 1 || source.deleted === true || String(source.deleted).toLowerCase() === 'true' ? 1 : 0,
    departments: normalizeDepartments(source.departments, source.department)
  };
}

function locateSqlJsFile(file, databasePath) {
  const candidates = [
    path.join(path.dirname(databasePath), '../node_modules/sql.js/dist', file),
    path.join(__dirname, '../node_modules/sql.js/dist', file),
    path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    path.join(path.dirname(require.resolve('sql.js/package.json')), 'dist', file)
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    if (fs.existsSync(candidates[index])) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

function createKanbanStore(options) {
  const config = options || {};
  const databasePath = path.resolve(String(config.databasePath || path.join(__dirname, '../database/kanban.db')));
  const databaseDir = path.dirname(databasePath);
  const snapshotsDir = path.resolve(String(config.snapshotsDir || path.join(databaseDir, 'snapshots')));
  let sqlJs = null;
  let database = null;
  let openPromise = null;
  let flushTimer = null;
  let flushPromise = null;
  let flushQueued = false;

  async function ensureDirectories() {
    await fs.promises.mkdir(databaseDir, { recursive: true });
    await fs.promises.mkdir(snapshotsDir, { recursive: true });
  }

  async function open() {
    if (database) return database;
    if (openPromise) return openPromise;
    openPromise = (async () => {
      await ensureDirectories();
      if (!sqlJs) sqlJs = await initSqlJs({ locateFile: (file) => locateSqlJsFile(file, databasePath) });
      let bytes = null;
      try {
        bytes = await fs.promises.readFile(databasePath);
      } catch (error) {
        bytes = null;
      }
      database = bytes && bytes.length ? new sqlJs.Database(new Uint8Array(bytes)) : new sqlJs.Database();
      return database;
    })();
    try {
      return await openPromise;
    } finally {
      openPromise = null;
    }
  }

  async function run(sql, params) {
    const db = await open();
    db.run(sql, Array.isArray(params) ? params : []);
    if (/^\s*(insert|update|delete|replace|create|drop|alter|commit)\b/i.test(String(sql || ''))) scheduleFlush();
    return Number(db.getRowsModified()) || 0;
  }

  async function all(sql, params) {
    const db = await open();
    const statement = db.prepare(sql);
    try {
      if (Array.isArray(params) && params.length) statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }

  async function one(sql, params) {
    const rows = await all(sql, params);
    return rows.length ? rows[0] : null;
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, 250);
  }

  async function flush() {
    if (!database) return;
    if (flushPromise) {
      flushQueued = true;
      return flushPromise;
    }
    flushPromise = (async () => {
      await ensureDirectories();
      const tempPath = `${databasePath}.tmp`;
      await fs.promises.writeFile(tempPath, Buffer.from(database.export()));
      await fs.promises.rename(tempPath, databasePath);
    })();
    try {
      await flushPromise;
    } finally {
      flushPromise = null;
      if (flushQueued) {
        flushQueued = false;
        await flush();
      }
    }
  }

  async function migrateSnapshots() {
    const marker = await one('SELECT value FROM kanban_meta WHERE key = ?', ['ndjson_migrated']);
    if (marker && marker.value === '1') return;
    const entries = await fs.promises.readdir(databaseDir, { withFileTypes: true }).catch(() => []);
    const files = entries
      .filter((entry) => entry.isFile() && /^kanban-snapshots-.*\.ndjson$/i.test(entry.name))
      .map((entry) => path.join(databaseDir, entry.name));
    for (let index = 0; index < files.length; index += 1) {
      const raw = await fs.promises.readFile(files[index], 'utf8').catch(() => '');
      const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        let parsed = null;
        try { parsed = JSON.parse(lines[lineIndex]); } catch (error) { parsed = null; }
        if (!parsed) continue;
        const savedAt = Date.parse(parsed.savedAt || parsed.saved_at || '');
        const rawBoard = parsed.kanban && typeof parsed.kanban === 'object' ? parsed.kanban : parsed;
        const todos = Array.isArray(rawBoard.todos) ? rawBoard.todos : (Array.isArray(rawBoard.cards) ? rawBoard.cards : []);
        for (let todoIndex = 0; todoIndex < todos.length; todoIndex += 1) {
          const card = normalizeCard(todos[todoIndex], Number.isFinite(savedAt) ? savedAt : Date.now());
          if (card) await upsertCard(card);
        }
      }
    }
    await run("INSERT INTO kanban_meta (key, value) VALUES ('ndjson_migrated', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  }

  async function initialize() {
    await ensureDirectories();
    await run(`CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      status TEXT,
      priority TEXT,
      due_at INTEGER,
      tags_json TEXT,
      attachments_json TEXT,
      depends_on_json TEXT,
      sprint_id TEXT,
      assigned_to TEXT,
      recurrence_json TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )`);
    await run(`CREATE TABLE IF NOT EXISTS card_departments (
      card_id TEXT NOT NULL,
      department_slug TEXT NOT NULL,
      department_label TEXT,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0,
      PRIMARY KEY (card_id, department_slug)
    )`);
    await run('CREATE TABLE IF NOT EXISTS kanban_meta (key TEXT PRIMARY KEY, value TEXT)');
    await run('CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at)');
    await run('CREATE INDEX IF NOT EXISTS idx_card_departments_slug ON card_departments(department_slug, deleted, updated_at)');
    await run('ALTER TABLE cards ADD COLUMN depends_on_json TEXT').catch(() => {});
    await run('ALTER TABLE cards ADD COLUMN assigned_to TEXT').catch(() => {});
    await migrateSnapshots();
    await flush();
  }

  async function upsertCard(cardInput) {
    const card = cardInput && cardInput.id ? cardInput : normalizeCard(cardInput, Date.now());
    if (!card) return false;
    await run('BEGIN IMMEDIATE TRANSACTION');
    try {
      await run(`INSERT INTO cards (
        id, title, description, status, priority, due_at, tags_json, attachments_json,
        depends_on_json, sprint_id, assigned_to, recurrence_json, created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        priority = excluded.priority,
        due_at = excluded.due_at,
        tags_json = excluded.tags_json,
        attachments_json = excluded.attachments_json,
        depends_on_json = excluded.depends_on_json,
        sprint_id = excluded.sprint_id,
        assigned_to = excluded.assigned_to,
        recurrence_json = excluded.recurrence_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
      WHERE excluded.updated_at > cards.updated_at`, [
        card.id, card.title, card.description, card.status, card.priority, card.dueAt,
        card.tagsJson, card.attachmentsJson, card.dependsOnJson, card.sprintId,
        card.assignedTo, card.recurrenceJson, card.createdAt, card.updatedAt, card.deleted
      ]);
      if (card.deleted === 1) {
        await run('UPDATE card_departments SET deleted = 1, updated_at = ? WHERE card_id = ? AND updated_at < ?', [card.updatedAt, card.id, card.updatedAt]);
      } else {
        for (let index = 0; index < card.departments.length; index += 1) {
          const department = card.departments[index];
          await run(`INSERT INTO card_departments (card_id, department_slug, department_label, updated_at, deleted)
            VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(card_id, department_slug) DO UPDATE SET
              department_label = excluded.department_label,
              updated_at = excluded.updated_at,
              deleted = 0
            WHERE excluded.updated_at > card_departments.updated_at`, [card.id, department.slug, department.label, card.updatedAt]);
        }
        const slugs = card.departments.map((department) => department.slug);
        if (slugs.length) {
          const placeholders = slugs.map(() => '?').join(', ');
          await run(`UPDATE card_departments SET deleted = 1, updated_at = ?
            WHERE card_id = ? AND deleted = 0 AND updated_at < ? AND department_slug NOT IN (${placeholders})`, [card.updatedAt, card.id, card.updatedAt].concat(slugs));
        } else {
          await run('UPDATE card_departments SET deleted = 1, updated_at = ? WHERE card_id = ? AND deleted = 0 AND updated_at < ?', [card.updatedAt, card.id, card.updatedAt]);
        }
      }
      await run('COMMIT');
      await flush();
      return true;
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  function mapCard(row, departments) {
    const departmentList = Array.isArray(departments) ? departments : [];
    const tags = parseJson(row.tags_json, []);
    const attachments = parseJson(row.attachments_json, []);
    const dependsOn = parseJson(row.depends_on_json, []);
    const recurrence = parseJson(row.recurrence_json, { type: 'none', lastTrigger: 0 });
    return {
      id: row.id,
      title: String(row.title || ''),
      text: String(row.title || ''),
      description: String(row.description || ''),
      status: String(row.status || 'todo'),
      priority: String(row.priority || 'med'),
      due_at: Number(row.due_at) || 0,
      dueAt: Number(row.due_at) || 0,
      tags: Array.isArray(tags) ? tags : [],
      attachments: Array.isArray(attachments) ? attachments : [],
      depends_on: Array.isArray(dependsOn) ? dependsOn : [],
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      sprint_id: String(row.sprint_id || ''),
      sprintId: String(row.sprint_id || ''),
      assigned_to: row.assigned_to ? String(row.assigned_to) : null,
      assigned_to_display: row.assigned_to ? String(row.assigned_to) : null,
      assignedTo: row.assigned_to ? String(row.assigned_to) : null,
      assignedToDisplay: row.assigned_to ? String(row.assigned_to) : null,
      recurrence,
      created_at: Number(row.created_at) || 0,
      createdAt: Number(row.created_at) || 0,
      updated_at: Number(row.updated_at) || 0,
      updatedAt: Number(row.updated_at) || 0,
      deleted: Number(row.deleted) ? 1 : 0,
      departments: departmentList.map((entry) => entry.label),
      department: departmentList.length ? departmentList[0].label : ''
    };
  }

  async function listByDepartment(department) {
    const slug = departmentSlug(department);
    if (!slug) return [];
    const rows = await all(`SELECT cards.* FROM cards
      INNER JOIN card_departments ON card_departments.card_id = cards.id
      WHERE card_departments.department_slug = ? AND card_departments.deleted = 0 AND cards.deleted = 0`, [slug]);
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');
    const relations = await all(`SELECT card_id, department_slug, department_label FROM card_departments
      WHERE card_id IN (${placeholders}) AND deleted = 0`, ids);
    const departmentsByCard = new Map();
    relations.forEach((entry) => {
      const list = departmentsByCard.get(entry.card_id) || [];
      list.push({ slug: entry.department_slug, label: entry.department_label || entry.department_slug });
      departmentsByCard.set(entry.card_id, list);
    });
    return rows.map((row) => mapCard(row, departmentsByCard.get(row.id) || []));
  }

  async function close() {
    if (flushTimer) clearTimeout(flushTimer);
    await flush();
    if (database && typeof database.close === 'function') database.close();
    database = null;
  }

  return {
    databasePath,
    databaseDir,
    snapshotsDir,
    ensureDirectories,
    initialize,
    normalizeCard,
    upsertCard,
    listByDepartment,
    flush,
    close
  };
}

module.exports = { createKanbanStore, normalizeCard, departmentSlug };
