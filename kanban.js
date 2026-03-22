const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);
const THEME_STORAGE_KEY = 'themeMode';
const KANBAN_SHOW_BACKLOG_KEY = 'kanbanShowBacklog';
const KANBAN_REALTIME_DELTA_KEY = 'kanbanRealtimeDelta';

function normalizeThemeMode(value) {
  return String(value || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

function updateThemeButtonLabel(mode) {
  const themeToggle = document.getElementById('themeToggleIntranet');
  if (!themeToggle) return;
  const isDark = mode === 'dark';
  const nextLabel = isDark ? 'claro' : 'escuro';
  themeToggle.textContent = '';
  themeToggle.setAttribute('aria-label', `Alternar para tema ${nextLabel}`);
  themeToggle.setAttribute('aria-checked', String(isDark));
  themeToggle.title = `Alternar para tema ${nextLabel}`;
}

function applyTheme(mode) {
  const normalized = normalizeThemeMode(mode);
  document.body.setAttribute('data-theme', normalized);
  updateThemeButtonLabel(normalized);
}

function initTheme() {
  browserAPI.storage.local.get([THEME_STORAGE_KEY], (result) => {
    applyTheme(result[THEME_STORAGE_KEY]);
  });

  const themeToggle = document.getElementById('themeToggleIntranet');
  if (!themeToggle) return;
  themeToggle.addEventListener('click', () => {
    const current = normalizeThemeMode(document.body.getAttribute('data-theme'));
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    browserAPI.storage.local.set({ [THEME_STORAGE_KEY]: next });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const kanbanOverlay = document.getElementById('kanbanOverlay');
  const kanbanBoard = document.getElementById('kanbanBoard');
  const todoForm = document.getElementById('todoForm');
  const todoInput = document.getElementById('todoInput');
  const closeKanbanBtn = document.getElementById('closeKanbanBtn');
  const refreshKanbanSnapshotBtn = document.getElementById('refreshKanbanSnapshotBtn');
  const kanbanBacklogList = document.getElementById('kanbanBacklogList');
  const kanbanTodoList = document.getElementById('kanbanTodoList');
  const kanbanDoingList = document.getElementById('kanbanDoingList');
  const kanbanDoneList = document.getElementById('kanbanDoneList');
  const kanbanColumnCountBacklog = document.getElementById('kanbanColumnCountBacklog');
  const kanbanColumnCountTodo = document.getElementById('kanbanColumnCountTodo');
  const kanbanColumnCountDoing = document.getElementById('kanbanColumnCountDoing');
  const kanbanColumnCountDone = document.getElementById('kanbanColumnCountDone');
  const todoSearchInput = document.getElementById('todoSearchInput');
  const priorityFilterInput = document.getElementById('priorityFilterInput');
  const departmentFilterInput = document.getElementById('departmentFilterInput');
  const tagFilterInput = document.getElementById('tagFilterInput');
  const sprintFilterInput = document.getElementById('sprintFilterInput');
  const toggleBacklogBtn = document.getElementById('toggleBacklogBtn');
  const clearBtn = document.getElementById('clearCompletedTodos');
  const toggleAllBtn = document.getElementById('toggleAllTodos');
  const kanbanDetailsPanel = document.getElementById('kanbanDetailsPanel');
  const closeKanbanDetailsBtn = document.getElementById('closeKanbanDetailsBtn');
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskPrioritySelect = document.getElementById('taskPrioritySelect');
  const taskDepartmentSelect = document.getElementById('taskDepartmentSelect');
  const addTaskDepartmentBtn = document.getElementById('addTaskDepartmentBtn');
  const taskDepartmentsList = document.getElementById('taskDepartmentsList');
  const taskDueDateInput = document.getElementById('taskDueDateInput');
  const taskTagInput = document.getElementById('taskTagInput');
  const addTaskTagBtn = document.getElementById('addTaskTagBtn');
  const taskTagsList = document.getElementById('taskTagsList');
  const taskAttachmentLabelInput = document.getElementById('taskAttachmentLabelInput');
  const taskAttachmentUrlInput = document.getElementById('taskAttachmentUrlInput');
  const pickTaskAttachmentFileBtn = document.getElementById('pickTaskAttachmentFileBtn');
  const addTaskAttachmentBtn = document.getElementById('addTaskAttachmentBtn');
  const taskAttachmentsList = document.getElementById('taskAttachmentsList');
  const taskDescriptionInput = document.getElementById('taskDescriptionInput');
  const taskRecurrenceSelect = document.getElementById('taskRecurrenceSelect');
  const taskSprintInput = document.getElementById('taskSprintInput');
  const cancelTaskDetailsBtn = document.getElementById('cancelTaskDetailsBtn');
  const saveTaskDetailsBtn = document.getElementById('saveTaskDetailsBtn');

  if (
    !kanbanOverlay || !kanbanBoard || !todoForm || !todoInput || !closeKanbanBtn
    || !kanbanBacklogList || !kanbanTodoList || !kanbanDoingList || !kanbanDoneList
    || !kanbanColumnCountBacklog || !kanbanColumnCountTodo || !kanbanColumnCountDoing || !kanbanColumnCountDone
    || !todoSearchInput || !priorityFilterInput || !departmentFilterInput || !tagFilterInput || !sprintFilterInput
    || !toggleBacklogBtn || !clearBtn || !toggleAllBtn
    || !kanbanDetailsPanel || !closeKanbanDetailsBtn
    || !taskTitleInput || !taskPrioritySelect || !taskDepartmentSelect || !addTaskDepartmentBtn || !taskDepartmentsList
    || !taskDueDateInput || !taskTagInput || !addTaskTagBtn || !taskTagsList
    || !taskAttachmentLabelInput || !taskAttachmentUrlInput || !pickTaskAttachmentFileBtn || !addTaskAttachmentBtn || !taskAttachmentsList
    || !taskDescriptionInput || !taskRecurrenceSelect || !taskSprintInput || !cancelTaskDetailsBtn || !saveTaskDetailsBtn
  ) {
    return;
  }

  initTheme();

  const statuses = ['backlog', 'todo', 'doing', 'done'];
  const syncStatuses = ['todo', 'doing', 'done'];
  const priorityOptions = ['low', 'med', 'high', 'urgent'];
  const recurrenceTypes = ['none', 'daily', 'weekly', 'monthly'];
  const priorityLabels = { low: 'Baixa', med: 'Média', high: 'Alta', urgent: 'Urgente' };
  const nativeAttachmentAllowedExtensions = (KanbanAPI && KanbanAPI.constants && KanbanAPI.constants.nativeAttachmentAllowedExtensions)
    ? KanbanAPI.constants.nativeAttachmentAllowedExtensions
    : [
      'pdf', 'doc', 'docx', 'xls', 'xlsx',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
      'zip', 'rar', '7z',
      'txt', 'csv', 'xml', 'json', 'html', 'htm'
    ];
  const listByStatus = {
    backlog: kanbanBacklogList,
    todo: kanbanTodoList,
    doing: kanbanDoingList,
    done: kanbanDoneList
  };
  const countByStatus = {
    backlog: kanbanColumnCountBacklog,
    todo: kanbanColumnCountTodo,
    doing: kanbanColumnCountDoing,
    done: kanbanColumnCountDone
  };

  const { sanitizePlainText, normalizeSearchText, normalizePriority, normalizeTag, normalizeDepartments, getSafeHttpUrl } = KanbanAPI.utils;

  let todosState = [];
  let orderByStatusState = { backlog: [], todo: [], doing: [], done: [] };
  let todoSearchTerm = '';
  let priorityFilterValue = 'all';
  let departmentFilterTerm = '';
  let tagFilterTerm = '';
  let sprintFilterTerm = '';
  let showBacklog = true;
  let draggingTodoId = '';
  let detailsTodoId = '';
  let detailsDraftDepartments = [];
  let detailsDraftTags = [];
  let detailsDraftAttachments = [];
  let currentUserDepartment = '';
  let pendingChanges = [];
  let isSyncInProgress = false;

  function normalizeDueAt(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function normalizeRecurrence(value) {
    if (!value || typeof value !== 'object') return { type: 'none', lastTrigger: 0 };
    const type = recurrenceTypes.includes(value.type) ? value.type : 'none';
    const lastTrigger = Number(value.lastTrigger) || 0;
    return { type, lastTrigger };
  }

  function normalizeAttachments(values) {
    const source = Array.isArray(values) ? values : [];
    return source
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const safeUrl = getSafeHttpUrl(item.url);
        if (!safeUrl) return null;
        const label = sanitizePlainText(item.label || '', 40) || safeUrl;
        const rawId = sanitizePlainText(item.id || '', 80);
        const fallbackId = sanitizePlainText(`${index}-${label}-${safeUrl}`, 80);
        return { id: rawId || fallbackId, label, url: safeUrl };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  function normalizeTodo(todo, fallbackIndex = 0) {
    if (!todo || typeof todo !== 'object') return null;
    const text = sanitizePlainText(todo.text || todo.title || '', 200);
    if (!text) return null;
    const createdAt = Number(todo.createdAt ?? todo.created_at) || Date.now();
    const updatedAt = Number(todo.updatedAt ?? todo.updated_at) || createdAt;
    const rawId = sanitizePlainText(todo.id || '', 80);
    const id = rawId || `${createdAt}-${fallbackIndex}`;
    const rawStatus = sanitizePlainText(todo.status || '', 20).toLowerCase();
    const status = statuses.includes(rawStatus) ? rawStatus : (todo.completed ? 'done' : 'todo');
    const tags = (Array.isArray(todo.tags) ? todo.tags : [])
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
      .slice(0, 10);
    return {
      id,
      text,
      completed: status === 'done',
      createdAt,
      updatedAt,
      deleted: Number(todo.deleted) ? 1 : 0,
      status,
      priority: priorityOptions.includes(normalizePriority(todo.priority)) ? normalizePriority(todo.priority) : 'med',
      departments: normalizeDepartments(todo.departments, todo.department),
      department: sanitizePlainText(todo.department || '', 60),
      dueAt: normalizeDueAt(todo.dueAt ?? todo.due_at),
      tags,
      attachments: normalizeAttachments(todo.attachments),
      description: sanitizePlainText(todo.description || '', 2000),
      recurrence: normalizeRecurrence(todo.recurrence),
      sprintId: sanitizePlainText(todo.sprintId || todo.sprint_id || '', 40),
      isBacklog: rawStatus === 'backlog' || Boolean(todo.isBacklog)
    };
  }

  function normalizeTodoList(todos) {
    return (Array.isArray(todos) ? todos : [])
      .map((todo, index) => normalizeTodo(todo, index))
      .filter(Boolean)
      .filter((todo) => !todo.deleted);
  }

  function normalizeOrderByStatus(orderCandidate, todos) {
    const validIds = new Set(todos.map((todo) => todo.id));
    const nextOrder = { backlog: [], todo: [], doing: [], done: [] };
    statuses.forEach((status) => {
      const seen = new Set();
      const rawIds = Array.isArray(orderCandidate && orderCandidate[status]) ? orderCandidate[status] : [];
      rawIds.forEach((value) => {
        const id = sanitizePlainText(value || '', 80);
        if (id && validIds.has(id) && !seen.has(id)) {
          nextOrder[status].push(id);
          seen.add(id);
        }
      });
      const missing = todos
        .filter((todo) => todo.status === status && !seen.has(todo.id))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((todo) => todo.id);
      nextOrder[status].push(...missing);
    });
    return nextOrder;
  }

  function syncStatusAndOrder() {
    todosState = todosState.map((todo) => {
      const nextStatus = statuses.includes(todo.status) ? todo.status : 'todo';
      return {
        ...todo,
        status: nextStatus,
        completed: nextStatus === 'done',
        isBacklog: nextStatus === 'backlog' ? true : Boolean(todo.isBacklog)
      };
    });
    orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
  }

  function getTodoById(id) {
    return todosState.find((todo) => todo.id === id);
  }

  function getTodoDepartments(todo) {
    return normalizeDepartments(todo && todo.departments, todo && todo.department);
  }

  function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function isSameLocalDay(t1, t2) {
    const d1 = new Date(t1);
    const d2 = new Date(t2);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  }

  function formatTodoDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDueDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function toInputDateValue(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromInputDateValue(value) {
    const raw = sanitizePlainText(value, 20);
    if (!raw) return 0;
    const parts = raw.split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 0;
    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  function hasActiveFilters() {
    return Boolean(todoSearchTerm || priorityFilterValue !== 'all' || departmentFilterTerm || tagFilterTerm || sprintFilterTerm);
  }

  function getSortedTodosForStatus(status) {
    const order = orderByStatusState[status] || [];
    const todosInStatus = todosState.filter((todo) => todo.status === status);
    return order
      .map((id) => todosInStatus.find((todo) => todo.id === id))
      .filter(Boolean)
      .concat(todosInStatus.filter((todo) => !order.includes(todo.id)));
  }

  function normalizeServerBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (!/^https?:$/i.test(url.protocol)) return '';
      return `${url.protocol}//${url.host}`;
    } catch {
      return '';
    }
  }

  function getServerBaseUrlFromStorage() {
    return new Promise((resolve) => {
      browserAPI.storage.local.get(['serverUrl'], (result) => {
        resolve(normalizeServerBaseUrl(result && result.serverUrl));
      });
    });
  }

  function getActiveDepartmentForSync() {
    return sanitizePlainText(currentUserDepartment || '', 60);
  }

  function isTodoInActiveDepartment(todo, activeDepartment = getActiveDepartmentForSync()) {
    const scopedDepartment = normalizeSearchText(activeDepartment);
    if (!scopedDepartment) return true;
    return getTodoDepartments(todo).some((department) => normalizeSearchText(department) === scopedDepartment);
  }

  function serializeTodoForSync(todo, override = {}) {
    const source = { ...(todo || {}), ...(override || {}) };
    const departments = normalizeDepartments(source.departments, source.department);
    const updatedAt = Number(source.updatedAt) || Date.now();
    const statusToSync = syncStatuses.includes(source.status) ? source.status : 'todo';
    return {
      id: sanitizePlainText(source.id || '', 80),
      title: sanitizePlainText(source.text || source.title || '', 200),
      description: sanitizePlainText(source.description || '', 2000),
      status: statusToSync,
      priority: normalizePriority(source.priority),
      due_at: normalizeDueAt(source.dueAt),
      tags: (Array.isArray(source.tags) ? source.tags : []).map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10),
      attachments: normalizeAttachments(source.attachments),
      departments,
      updated_at: updatedAt,
      created_at: Number(source.createdAt) || updatedAt,
      deleted: Number(source.deleted) ? 1 : 0
    };
  }

  function persistPendingChanges() {
    browserAPI.storage.local.set({ pendingChanges });
  }

  function queuePendingCardChange(payload) {
    if (!payload || !payload.id) return;
    const nextUpdatedAt = Number(payload.updated_at) || Date.now();
    const index = pendingChanges.findIndex((entry) => entry && entry.id === payload.id);
    if (index >= 0) {
      const currentUpdatedAt = Number(pendingChanges[index].updated_at) || 0;
      if (nextUpdatedAt >= currentUpdatedAt) {
        pendingChanges[index] = { ...payload, updated_at: nextUpdatedAt };
      }
    } else {
      pendingChanges.push({ ...payload, updated_at: nextUpdatedAt });
    }
    persistPendingChanges();
  }

  async function flushPendingChanges() {
    if (isSyncInProgress || !pendingChanges.length) return;
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) return;
    isSyncInProgress = true;
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/cards/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: pendingChanges })
      });
      if (!response.ok) return;
      pendingChanges = [];
      persistPendingChanges();
    } catch {
      return;
    } finally {
      isSyncInProgress = false;
    }
  }

  async function syncCardChange(todoPayload) {
    const payload = todoPayload && typeof todoPayload === 'object' ? todoPayload : null;
    if (!payload || !payload.id) return;
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) {
      queuePendingCardChange(payload);
      return;
    }
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        queuePendingCardChange(payload);
        return;
      }
      await flushPendingChanges();
    } catch {
      queuePendingCardChange(payload);
    }
  }

  function toNumberOrZero(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizeRealtimeCard(cardInput) {
    if (!cardInput || typeof cardInput !== 'object') return null;
    const incomingUpdatedAt = toNumberOrZero(cardInput.updated_at ?? cardInput.updatedAt) || Date.now();
    const incomingCreatedAt = toNumberOrZero(cardInput.created_at ?? cardInput.createdAt) || incomingUpdatedAt;
    const normalizedList = normalizeTodoList([{
      ...cardInput,
      text: cardInput.title || cardInput.text || '',
      dueAt: cardInput.due_at ?? cardInput.dueAt,
      sprintId: cardInput.sprint_id ?? cardInput.sprintId,
      updatedAt: incomingUpdatedAt,
      createdAt: incomingCreatedAt,
      recurrence: cardInput.recurrence && typeof cardInput.recurrence === 'object'
        ? cardInput.recurrence
        : { type: 'none', lastTrigger: 0 },
      isBacklog: String(cardInput.status || '').toLowerCase() === 'backlog'
    }]);
    return normalizedList[0] || null;
  }

  function applyRealtimeKanbanDelta(deltaEnvelope) {
    const delta = deltaEnvelope && typeof deltaEnvelope === 'object' && deltaEnvelope.payload
      ? deltaEnvelope.payload
      : deltaEnvelope;
    if (!delta || typeof delta !== 'object') return;
    const cards = [];
    if (Array.isArray(delta.cards)) {
      delta.cards.forEach((card) => cards.push(card));
    } else if (delta.card && typeof delta.card === 'object') {
      cards.push(delta.card);
    }
    if (!cards.length) return;

    let nextTodos = [...todosState];
    let hasChanges = false;

    cards.forEach((incomingCard) => {
      const incomingId = sanitizePlainText(incomingCard && incomingCard.id ? incomingCard.id : '', 80);
      if (!incomingId) return;
      const incomingUpdatedAt = toNumberOrZero(incomingCard.updated_at ?? incomingCard.updatedAt);
      const existingIndex = nextTodos.findIndex((todo) => todo.id === incomingId);
      const existingUpdatedAt = existingIndex >= 0 ? (Number(nextTodos[existingIndex].updatedAt) || 0) : 0;
      if (existingIndex >= 0 && incomingUpdatedAt > 0 && incomingUpdatedAt <= existingUpdatedAt) return;
      const isDeleted = Number(incomingCard.deleted) === 1 || String(incomingCard.deleted).toLowerCase() === 'true';
      if (isDeleted) {
        if (existingIndex >= 0) {
          nextTodos.splice(existingIndex, 1);
          hasChanges = true;
        }
        return;
      }
      const normalizedCard = normalizeRealtimeCard(incomingCard);
      if (!normalizedCard) return;
      const belongsToActiveDepartment = isTodoInActiveDepartment(normalizedCard);
      if (!belongsToActiveDepartment && existingIndex < 0) return;
      if (!belongsToActiveDepartment && existingIndex >= 0) {
        nextTodos.splice(existingIndex, 1);
        hasChanges = true;
        return;
      }
      if (existingIndex >= 0) {
        nextTodos[existingIndex] = normalizedCard;
        hasChanges = true;
        return;
      }
      nextTodos.push(normalizedCard);
      hasChanges = true;
    });

    if (!hasChanges) return;
    saveTodos(nextTodos, { skipRender: false });
  }

  function checkRecurrences() {
    const now = Date.now();
    const clones = [];
    let hasChanges = false;

    todosState = todosState.map((todo) => {
      const recurrence = normalizeRecurrence(todo.recurrence);
      if (recurrence.type === 'none') return { ...todo, recurrence };
      let interval = 0;
      if (recurrence.type === 'daily') interval = 24 * 60 * 60 * 1000;
      if (recurrence.type === 'weekly') interval = 7 * 24 * 60 * 60 * 1000;
      if (recurrence.type === 'monthly') interval = 30 * 24 * 60 * 60 * 1000;
      const lastTime = recurrence.lastTrigger || todo.createdAt || now;
      if (interval > 0 && now - lastTime >= interval) {
        const updated = { ...todo, recurrence: { ...recurrence, lastTrigger: now } };
        const clone = {
          ...todo,
          id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
          status: todo.status === 'backlog' ? 'backlog' : 'todo',
          completed: false,
          createdAt: now,
          updatedAt: now,
          deleted: 0,
          recurrence: { ...recurrence, lastTrigger: 0 }
        };
        clones.push(clone);
        hasChanges = true;
        return updated;
      }
      return { ...todo, recurrence };
    });

    if (clones.length) {
      todosState = [...todosState, ...clones];
    }
    if (hasChanges) {
      syncStatusAndOrder();
      browserAPI.storage.local.set({
        userTodos: todosState,
        kanbanOrderByStatus: orderByStatusState
      });
      renderTodos();
    }
  }

  async function refreshKanbanCardsFromServer() {
    await flushPendingChanges();
    const serverBaseUrl = await getServerBaseUrlFromStorage();
    if (!serverBaseUrl) {
      return { ok: false, code: 'MISSING_SERVER_URL', message: 'Servidor não configurado.' };
    }
    const activeDepartment = getActiveDepartmentForSync();
    if (!activeDepartment) {
      return { ok: false, code: 'MISSING_DEPARTMENT', message: 'Departamento não definido para atualizar o Kanban.' };
    }
    const query = new URLSearchParams({ department: activeDepartment }).toString();
    try {
      const response = await fetch(`${serverBaseUrl}/api/kanban/cards?${query}`, { method: 'GET' });
      if (!response.ok) {
        if (response.status === 400) {
          return { ok: false, code: 'INVALID_DEPARTMENT', message: 'Departamento inválido para buscar cards.' };
        }
        return { ok: false, code: 'REQUEST_FAILED', message: 'Falha ao consultar cards no servidor.' };
      }
      const data = await response.json();
      const cards = Array.isArray(data && data.cards) ? data.cards : [];
      const normalizedCards = normalizeTodoList(cards.map((card) => ({
        ...card,
        text: card.title || card.text || '',
        updatedAt: Number(card.updated_at ?? card.updatedAt) || Date.now(),
        deleted: Number(card.deleted) ? 1 : 0
      })));
      const targetDepartment = normalizeSearchText(activeDepartment);
      const localOutsideDepartment = todosState.filter((todo) => (
        !getTodoDepartments(todo).some((department) => normalizeSearchText(department) === targetDepartment)
      ));
      const localBacklogInDepartment = todosState.filter((todo) => (
        todo.status === 'backlog'
        && getTodoDepartments(todo).some((department) => normalizeSearchText(department) === targetDepartment)
      ));
      const merged = normalizeTodoList([...localOutsideDepartment, ...localBacklogInDepartment]);
      normalizedCards.forEach((card) => {
        const existingIndex = merged.findIndex((todo) => todo.id === card.id);
        if (existingIndex < 0) {
          merged.push(card);
          return;
        }
        const existingUpdatedAt = Number(merged[existingIndex].updatedAt) || 0;
        const incomingUpdatedAt = Number(card.updatedAt) || 0;
        if (incomingUpdatedAt > existingUpdatedAt) {
          merged[existingIndex] = card;
        }
      });
      todosState = normalizeTodoList(merged);
      orderByStatusState = normalizeOrderByStatus(orderByStatusState, todosState);
      saveTodos(todosState, { skipRender: false });
      await flushPendingChanges();
      return { ok: true };
    } catch {
      return { ok: false, code: 'NETWORK_ERROR', message: 'Falha de conexão ao buscar cards.' };
    }
  }

  function saveTodos(todos, options = {}) {
    todosState = normalizeTodoList(todos);
    syncStatusAndOrder();
    browserAPI.storage.local.set({
      userTodos: todosState,
      kanbanOrderByStatus: orderByStatusState
    });
    if (!options.skipRender) {
      renderTodos();
    }
  }

  function loadTodos() {
    browserAPI.storage.local.get(['userTodos', 'kanbanOrderByStatus', 'browserDepartment', 'pendingChanges', KANBAN_SHOW_BACKLOG_KEY], (result) => {
      todosState = normalizeTodoList(result.userTodos || []);
      orderByStatusState = normalizeOrderByStatus(result.kanbanOrderByStatus, todosState);
      currentUserDepartment = sanitizePlainText(result.browserDepartment || '', 60);
      pendingChanges = Array.isArray(result.pendingChanges) ? result.pendingChanges.filter((entry) => entry && entry.id) : [];
      showBacklog = typeof result[KANBAN_SHOW_BACKLOG_KEY] === 'boolean' ? result[KANBAN_SHOW_BACKLOG_KEY] : true;
      checkRecurrences();
      renderTodos();
      void flushPendingChanges();
      void refreshKanbanCardsFromServer();
    });
  }

  function getDueClass(dueAt) {
    if (dueAt < getStartOfToday()) return 'kanban-due-overdue';
    if (isSameLocalDay(dueAt, Date.now())) return 'kanban-due-today';
    return '';
  }

  function matchesFilters(todo) {
    const departments = getTodoDepartments(todo);
    if (!isTodoInActiveDepartment(todo)) return false;
    const searchable = normalizeSearchText([
      todo.text,
      ...departments,
      todo.description,
      ...(Array.isArray(todo.tags) ? todo.tags : [])
    ].join(' '));
    if (todoSearchTerm && !searchable.includes(todoSearchTerm)) return false;
    if (priorityFilterValue !== 'all' && todo.priority !== priorityFilterValue) return false;
    if (departmentFilterTerm && !departments.some((department) => normalizeSearchText(department).includes(departmentFilterTerm))) {
      return false;
    }
    if (tagFilterTerm && !todo.tags.some((tag) => normalizeSearchText(tag).includes(tagFilterTerm))) {
      return false;
    }
    if (sprintFilterTerm && normalizeSearchText(todo.sprintId) !== sprintFilterTerm) return false;
    return true;
  }

  function renderCardActions(todo) {
    const idx = statuses.indexOf(todo.status);
    let html = '';
    if (idx > 0) html += `<button class="kanban-card-btn action-move" data-target="${statuses[idx - 1]}">←</button>`;
    if (idx < statuses.length - 1) html += `<button class="kanban-card-btn action-move" data-target="${statuses[idx + 1]}">→</button>`;
    html += '<button class="kanban-card-btn action-delete">×</button>';
    return html;
  }

  function createCard(todo) {
    const card = document.createElement('li');
    card.className = 'kanban-card';
    card.dataset.id = todo.id;
    card.setAttribute('draggable', hasActiveFilters() ? 'false' : 'true');

    const departments = getTodoDepartments(todo);
    const tags = Array.isArray(todo.tags) ? todo.tags : [];
    const recurrenceType = normalizeRecurrence(todo.recurrence).type;

    card.innerHTML = `
      <div class="kanban-card-header">
        <div class="kanban-card-text">${todo.text}</div>
        <span class="kanban-priority-badge kanban-priority-${todo.priority}">${priorityLabels[todo.priority] || 'Média'}</span>
      </div>
      <div class="kanban-card-submeta">
        ${departments.map((department) => `<span>${department}</span>`).join('')}
        ${todo.dueAt > 0 ? `<span class="${getDueClass(todo.dueAt)}">📅 ${formatDueDate(todo.dueAt)}</span>` : ''}
      </div>
      <div class="kanban-card-tags">
        ${tags.slice(0, 3).map((tag) => `<span class="kanban-tag-chip">${tag}</span>`).join('')}
      </div>
      <div class="kanban-card-indicators">
        ${todo.attachments.length ? `<span>🔗 ${todo.attachments.length}</span>` : ''}
        ${todo.description ? '<span>📝</span>' : ''}
        ${todo.sprintId ? `<span>#${todo.sprintId}</span>` : ''}
        ${recurrenceType !== 'none' ? `<span class="recurrence-badge">🕒 ${recurrenceType}</span>` : ''}
      </div>
      <div class="kanban-card-meta">
        <span class="kanban-card-date">${formatTodoDate(todo.createdAt)}</span>
        <div class="kanban-card-actions">
          ${renderCardActions(todo)}
        </div>
      </div>
    `;

    card.addEventListener('click', (event) => {
      if (!event.target.closest('button')) {
        openDetails(todo.id);
      }
    });

    card.addEventListener('dragstart', (event) => {
      if (hasActiveFilters()) {
        event.preventDefault();
        return;
      }
      draggingTodoId = todo.id;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      draggingTodoId = '';
      card.classList.remove('dragging');
    });

    card.querySelectorAll('.action-move').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        moveTodo(todo.id, btn.dataset.target);
      });
    });

    const deleteBtn = card.querySelector('.action-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const confirmed = window.confirm('Tem certeza que deseja excluir este card?');
        if (!confirmed) return;
        deleteTodo(todo.id);
      });
    }

    return card;
  }

  function renderStatusColumn(status) {
    const list = listByStatus[status];
    const countEl = countByStatus[status];
    if (!list || !countEl) return;
    list.innerHTML = '';
    const items = getSortedTodosForStatus(status).filter((todo) => matchesFilters(todo));
    countEl.textContent = String(items.length);
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'kanban-empty';
      empty.textContent = hasActiveFilters() ? 'Nada encontrado' : 'Vazio';
      list.appendChild(empty);
      return;
    }
    items.forEach((todo) => {
      list.appendChild(createCard(todo));
    });
  }

  function renderTodos() {
    kanbanBoard.classList.toggle('hide-backlog', !showBacklog);
    statuses.forEach((status) => renderStatusColumn(status));
  }

  function clearDetailsForm() {
    detailsTodoId = '';
    detailsDraftDepartments = [];
    detailsDraftTags = [];
    detailsDraftAttachments = [];
    taskTitleInput.value = '';
    taskPrioritySelect.value = 'med';
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = '';
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = '';
    taskRecurrenceSelect.value = 'none';
    taskSprintInput.value = '';
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
  }

  function renderDetailsDepartments() {
    taskDepartmentsList.innerHTML = '';
    if (!detailsDraftDepartments.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhum departamento adicionado';
      taskDepartmentsList.appendChild(empty);
      return;
    }
    detailsDraftDepartments.forEach((department) => {
      const chip = document.createElement('span');
      chip.className = 'kanban-chip';
      const text = document.createElement('span');
      text.className = 'kanban-chip-text';
      text.textContent = department;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover departamento';
      removeBtn.addEventListener('click', () => {
        const normalizedDepartment = normalizeSearchText(department);
        detailsDraftDepartments = detailsDraftDepartments.filter((value) => normalizeSearchText(value) !== normalizedDepartment);
        renderDetailsDepartments();
      });
      chip.appendChild(text);
      chip.appendChild(removeBtn);
      taskDepartmentsList.appendChild(chip);
    });
  }

  function renderDetailsTags() {
    taskTagsList.innerHTML = '';
    if (!detailsDraftTags.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhuma tag adicionada';
      taskTagsList.appendChild(empty);
      return;
    }
    detailsDraftTags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'kanban-chip';
      const text = document.createElement('span');
      text.className = 'kanban-chip-text';
      text.textContent = tag;
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover tag';
      removeBtn.addEventListener('click', () => {
        const normalizedTag = normalizeSearchText(tag);
        detailsDraftTags = detailsDraftTags.filter((value) => normalizeSearchText(value) !== normalizedTag);
        renderDetailsTags();
      });
      chip.appendChild(text);
      chip.appendChild(removeBtn);
      taskTagsList.appendChild(chip);
    });
  }

  function requestOpenNativeFileAttachment(fileUrl) {
    return new Promise((resolve) => {
      try {
        browserAPI.runtime.sendMessage({
          type: 'openNativeFileAttachment',
          fileUrl,
          allowedExtensions: nativeAttachmentAllowedExtensions
        }, (response) => {
          if (browserAPI.runtime.lastError) {
            resolve({
              ok: false,
              code: 'NATIVE_HOST_ERROR',
              message: String(browserAPI.runtime.lastError.message || 'native-host-indisponivel')
            });
            return;
          }
          resolve(response && typeof response === 'object'
            ? response
            : { ok: false, code: 'NATIVE_RESPONSE_INVALID', message: 'resposta-invalida' });
        });
      } catch (error) {
        resolve({
          ok: false,
          code: 'NATIVE_OPEN_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-abrir-arquivo')
        });
      }
    });
  }

  async function openDraftAttachmentInNative(attachment) {
    if (!attachment) return;
    const safeUrl = getSafeHttpUrl(attachment.url);
    if (!safeUrl || !/^file:/i.test(safeUrl)) return;
    const result = await requestOpenNativeFileAttachment(safeUrl);
    if (!result || !result.ok) {
      alert(`Não foi possível abrir o arquivo.${result && result.message ? `\n${result.message}` : ''}`);
    }
  }

  function renderDetailsAttachments() {
    taskAttachmentsList.innerHTML = '';
    if (!detailsDraftAttachments.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhum link adicionado';
      taskAttachmentsList.appendChild(empty);
      return;
    }
    detailsDraftAttachments.forEach((attachment) => {
      const item = document.createElement('div');
      item.className = 'kanban-link-item';
      const safeUrl = getSafeHttpUrl(attachment.url);
      const isFileAttachment = /^file:/i.test(safeUrl);
      let actionNode;
      if (isFileAttachment) {
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'kanban-link-anchor';
        openBtn.textContent = attachment.label;
        openBtn.addEventListener('click', () => {
          void openDraftAttachmentInNative(attachment);
        });
        actionNode = openBtn;
      } else {
        const anchor = document.createElement('a');
        anchor.className = 'kanban-link-anchor';
        anchor.href = safeUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = attachment.label;
        actionNode = anchor;
      }
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'kanban-chip-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remover link';
      removeBtn.addEventListener('click', () => {
        detailsDraftAttachments = detailsDraftAttachments.filter((itemCandidate) => itemCandidate.id !== attachment.id);
        renderDetailsAttachments();
      });
      item.appendChild(actionNode);
      item.appendChild(removeBtn);
      taskAttachmentsList.appendChild(item);
    });
  }

  function openDetails(todoId) {
    const todo = getTodoById(todoId);
    if (!todo) return;
    detailsTodoId = todo.id;
    detailsDraftDepartments = getTodoDepartments(todo);
    detailsDraftTags = Array.isArray(todo.tags) ? todo.tags.map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10) : [];
    detailsDraftAttachments = normalizeAttachments(todo.attachments);
    taskTitleInput.value = todo.text;
    taskPrioritySelect.value = todo.priority;
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = toInputDateValue(todo.dueAt);
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = todo.description || '';
    taskRecurrenceSelect.value = normalizeRecurrence(todo.recurrence).type;
    taskSprintInput.value = todo.sprintId || '';
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
    kanbanDetailsPanel.classList.add('is-open');
  }

  function closeDetails() {
    clearDetailsForm();
    kanbanDetailsPanel.classList.remove('is-open');
  }

  async function pickDraftAttachmentFromNative() {
    if (!detailsTodoId) return;
    if (detailsDraftAttachments.length >= 10) return;
    const result = await KanbanAPI.native.requestNativeFileAttachment();
    if (!result || !result.ok) {
      if (result && result.code === 'CANCELLED') return;
      alert(`Não foi possível selecionar o arquivo.${result && result.message ? `\n${result.message}` : ''}`);
      return;
    }
    const safeUrl = getSafeHttpUrl(result.fileUrl || '');
    if (!safeUrl) {
      alert('O arquivo selecionado não gerou um link válido.');
      return;
    }
    taskAttachmentLabelInput.value = sanitizePlainText(result.fileName || '', 40) || taskAttachmentLabelInput.value;
    taskAttachmentUrlInput.value = safeUrl;
    addDraftAttachment();
    if (!result.isNetworkPath) {
      alert('Arquivo local selecionado. O link pode não funcionar para outros usuários.');
    }
  }

  function addDraftDepartment() {
    const department = sanitizePlainText(taskDepartmentSelect.value, 60);
    if (!department) return;
    const normalizedDepartment = normalizeSearchText(department);
    if (detailsDraftDepartments.some((value) => normalizeSearchText(value) === normalizedDepartment)) return;
    detailsDraftDepartments = [...detailsDraftDepartments, department].slice(0, 6);
    taskDepartmentSelect.value = '';
    renderDetailsDepartments();
  }

  function addDraftTag() {
    const tag = normalizeTag(taskTagInput.value);
    if (!tag) return;
    const normalizedTag = normalizeSearchText(tag);
    if (detailsDraftTags.some((value) => normalizeSearchText(value) === normalizedTag)) return;
    detailsDraftTags = [...detailsDraftTags, tag].slice(0, 10);
    taskTagInput.value = '';
    renderDetailsTags();
  }

  function addDraftAttachment() {
    const label = sanitizePlainText(taskAttachmentLabelInput.value, 40);
    const safeUrl = getSafeHttpUrl(taskAttachmentUrlInput.value);
    if (!safeUrl) return;
    if (detailsDraftAttachments.length >= 10) return;
    const id = sanitizePlainText(`${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, 80);
    detailsDraftAttachments = [...detailsDraftAttachments, { id, label: label || safeUrl, url: safeUrl }];
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    renderDetailsAttachments();
  }

  function saveDetails() {
    if (!detailsTodoId) return;
    const todo = getTodoById(detailsTodoId);
    if (!todo) {
      closeDetails();
      return;
    }
    const nextText = sanitizePlainText(taskTitleInput.value, 200);
    if (!nextText) {
      taskTitleInput.focus();
      return;
    }
    const nextPriority = normalizePriority(taskPrioritySelect.value);
    const nextDepartments = normalizeDepartments(detailsDraftDepartments);
    const nextDepartment = nextDepartments[0] || '';
    const nextDueAt = fromInputDateValue(taskDueDateInput.value);
    const nextDescription = sanitizePlainText(taskDescriptionInput.value, 2000);
    const nextTags = detailsDraftTags.map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10);
    const nextAttachments = normalizeAttachments(detailsDraftAttachments);
    const recurrenceType = recurrenceTypes.includes(taskRecurrenceSelect.value) ? taskRecurrenceSelect.value : 'none';
    const nextSprintId = sanitizePlainText(taskSprintInput.value, 40);
    const updatedAt = Date.now();
    let changedTodo = null;
    todosState = todosState.map((current) => (
      current.id === detailsTodoId
        ? {
          ...current,
          text: nextText,
          priority: nextPriority,
          departments: nextDepartments,
          department: nextDepartment,
          dueAt: nextDueAt,
          tags: nextTags,
          attachments: nextAttachments,
          description: nextDescription,
          recurrence: {
            type: recurrenceType,
            lastTrigger: current.recurrence && current.recurrence.lastTrigger ? current.recurrence.lastTrigger : 0
          },
          sprintId: nextSprintId,
          updatedAt
        }
        : current
    ));
    changedTodo = todosState.find((current) => current.id === detailsTodoId) || null;
    const activeDepartment = getActiveDepartmentForSync();
    if (changedTodo && !isTodoInActiveDepartment(changedTodo, activeDepartment)) {
      todosState = todosState.filter((current) => current.id !== changedTodo.id);
      statuses.forEach((status) => {
        orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== changedTodo.id);
      });
    }
    saveTodos(todosState);
    if (changedTodo) {
      void syncCardChange(serializeTodoForSync(changedTodo));
    }
    closeDetails();
  }

  function moveTodo(todoId, nextStatus) {
    if (!statuses.includes(nextStatus)) return;
    const movedTodo = getTodoById(todoId);
    if (!movedTodo) return;
    const updatedAt = Date.now();
    let hasChanged = false;
    todosState = todosState.map((todo) => {
      if (todo.id !== todoId) return todo;
      hasChanged = true;
      return {
        ...todo,
        status: nextStatus,
        isBacklog: nextStatus === 'backlog',
        completed: nextStatus === 'done',
        updatedAt
      };
    });
    if (!hasChanged) return;
    statuses.forEach((status) => {
      orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== todoId);
    });
    orderByStatusState[nextStatus] = [...orderByStatusState[nextStatus], todoId];
    saveTodos(todosState);
    const changedTodo = getTodoById(todoId);
    if (changedTodo) {
      void syncCardChange(serializeTodoForSync(changedTodo));
    }
  }

  function deleteTodo(todoId) {
    const todo = getTodoById(todoId);
    if (!todo) return;
    const deletedPayload = serializeTodoForSync({ ...todo, deleted: 1, updatedAt: Date.now() });
    todosState = todosState.filter((current) => current.id !== todoId);
    statuses.forEach((status) => {
      orderByStatusState[status] = orderByStatusState[status].filter((id) => id !== todoId);
    });
    saveTodos(todosState);
    void syncCardChange(deletedPayload);
    if (detailsTodoId === todoId) {
      closeDetails();
    }
  }

  function persistOrderFromDom(targetStatus) {
    const list = listByStatus[targetStatus];
    const cardIds = [...list.querySelectorAll('.kanban-card')].map((card) => card.dataset.id).filter(Boolean);
    statuses.forEach((status) => {
      orderByStatusState[status] = orderByStatusState[status].filter((id) => !cardIds.includes(id));
    });
    orderByStatusState[targetStatus] = cardIds;
  }

  function getAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
    return elements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
  }

  todoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = sanitizePlainText(todoInput.value, 200);
    if (!text) return;
    const createdAt = Date.now();
    const id = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const activeDepartment = getActiveDepartmentForSync();
    const departments = activeDepartment ? [activeDepartment] : [];
    const status = showBacklog ? 'backlog' : 'todo';
    const newTodo = {
      id,
      text,
      completed: false,
      createdAt,
      updatedAt: createdAt,
      deleted: 0,
      status,
      isBacklog: status === 'backlog',
      priority: 'med',
      departments,
      department: departments[0] || '',
      dueAt: 0,
      tags: [],
      attachments: [],
      description: '',
      recurrence: { type: 'none', lastTrigger: 0 },
      sprintId: ''
    };
    todosState = [...todosState, newTodo];
    orderByStatusState[status] = [...orderByStatusState[status], id];
    saveTodos(todosState);
    void syncCardChange(serializeTodoForSync(newTodo));
    todoInput.value = '';
  });

  clearBtn.addEventListener('click', () => {
    const doneTodos = todosState.filter((todo) => todo.status === 'done');
    if (!doneTodos.length) return;
    const clearConfirmed = window.confirm('Tem certeza que deseja excluir todos os cards concluídos?');
    if (!clearConfirmed) return;
    const payloads = doneTodos.map((todo) => serializeTodoForSync({ ...todo, deleted: 1, updatedAt: Date.now() }));
    todosState = todosState.filter((todo) => todo.status !== 'done');
    orderByStatusState.done = [];
    saveTodos(todosState);
    payloads.forEach((payload) => {
      void syncCardChange(payload);
    });
    closeDetails();
  });

  toggleAllBtn.addEventListener('click', () => {
    if (!todosState.length) return;
    const allDone = todosState.every((todo) => todo.status === 'done');
    const toggleMessage = allDone
      ? 'Tem certeza que deseja marcar todos os cards como pendentes?'
      : 'Tem certeza que deseja marcar todos os cards como concluídos?';
    const toggleConfirmed = window.confirm(toggleMessage);
    if (!toggleConfirmed) return;
    const target = allDone ? 'todo' : 'done';
    const updatedAt = Date.now();
    todosState = todosState.map((todo) => ({
      ...todo,
      status: target,
      isBacklog: false,
      completed: target === 'done',
      updatedAt
    }));
    syncStatusAndOrder();
    saveTodos(todosState);
    todosState.forEach((todo) => {
      void syncCardChange(serializeTodoForSync(todo));
    });
  });

  addTaskDepartmentBtn.addEventListener('click', addDraftDepartment);
  addTaskTagBtn.addEventListener('click', addDraftTag);
  addTaskAttachmentBtn.addEventListener('click', addDraftAttachment);
  pickTaskAttachmentFileBtn.addEventListener('click', () => {
    void pickDraftAttachmentFromNative();
  });
  saveTaskDetailsBtn.addEventListener('click', saveDetails);
  cancelTaskDetailsBtn.addEventListener('click', closeDetails);
  closeKanbanDetailsBtn.addEventListener('click', closeDetails);
  closeKanbanBtn.addEventListener('click', () => {
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'kanban-preview-close-request' }, '*');
      return;
    }
    window.location.href = 'intranet.html';
  });

  if (refreshKanbanSnapshotBtn) {
    refreshKanbanSnapshotBtn.addEventListener('click', async () => {
      const originalLabel = refreshKanbanSnapshotBtn.textContent;
      refreshKanbanSnapshotBtn.disabled = true;
      refreshKanbanSnapshotBtn.textContent = '...';
      const result = await refreshKanbanCardsFromServer();
      refreshKanbanSnapshotBtn.disabled = false;
      refreshKanbanSnapshotBtn.textContent = originalLabel;
      if (!result || !result.ok) {
        alert(`Não foi possível atualizar o Kanban.${result && result.message ? `\n${result.message}` : ''}`);
      }
    });
  }

  taskDepartmentSelect.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftDepartment();
    }
  });
  taskTagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftTag();
    }
  });
  taskAttachmentUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftAttachment();
    }
  });

  todoSearchInput.addEventListener('input', (event) => {
    todoSearchTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  priorityFilterInput.addEventListener('change', (event) => {
    priorityFilterValue = event.target && event.target.value ? event.target.value : 'all';
    renderTodos();
  });
  departmentFilterInput.addEventListener('input', (event) => {
    departmentFilterTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  tagFilterInput.addEventListener('input', (event) => {
    tagFilterTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  sprintFilterInput.addEventListener('input', (event) => {
    sprintFilterTerm = normalizeSearchText(event.target && event.target.value);
    renderTodos();
  });
  toggleBacklogBtn.addEventListener('click', () => {
    showBacklog = !showBacklog;
    browserAPI.storage.local.set({ [KANBAN_SHOW_BACKLOG_KEY]: showBacklog });
    renderTodos();
  });

  statuses.forEach((status) => {
    const list = listByStatus[status];
    list.addEventListener('dragover', (event) => {
      if (hasActiveFilters() || !draggingTodoId) return;
      event.preventDefault();
      list.classList.add('drag-over');
      const draggingCard = document.querySelector('.kanban-card.dragging');
      if (!draggingCard) return;
      const afterElement = getAfterElement(list, event.clientY);
      if (!afterElement) {
        list.appendChild(draggingCard);
      } else {
        list.insertBefore(draggingCard, afterElement);
      }
    });
    list.addEventListener('dragleave', () => {
      list.classList.remove('drag-over');
    });
    list.addEventListener('drop', (event) => {
      if (hasActiveFilters() || !draggingTodoId) return;
      event.preventDefault();
      list.classList.remove('drag-over');
      const todoId = sanitizePlainText(draggingTodoId, 80);
      if (!todoId) return;
      const movedTodo = getTodoById(todoId);
      if (!movedTodo) return;
      const updatedAt = Date.now();
      todosState = todosState.map((todo) => (
        todo.id === todoId
          ? { ...todo, status, isBacklog: status === 'backlog', completed: status === 'done', updatedAt }
          : todo
      ));
      persistOrderFromDom(status);
      saveTodos(todosState);
      const nextTodo = getTodoById(todoId);
      if (nextTodo) {
        void syncCardChange(serializeTodoForSync(nextTodo));
      }
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT')) {
      if (event.key === 'Escape') {
        event.target.blur();
      }
      return;
    }
    const key = String(event.key || '').toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      todoInput.focus();
    }
    if (key === 'f') {
      event.preventDefault();
      todoSearchInput.focus();
    }
    if (key === 'b') {
      event.preventDefault();
      toggleBacklogBtn.click();
    }
    if (key === 'escape') {
      if (kanbanDetailsPanel.classList.contains('is-open')) {
        closeDetails();
      }
    }
  });

  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.browserDepartment) {
      currentUserDepartment = sanitizePlainText(changes.browserDepartment.newValue || '', 60);
      renderTodos();
    }
    if (changes.themeMode) {
      applyTheme(changes.themeMode.newValue);
    }
    if (changes[KANBAN_REALTIME_DELTA_KEY]) {
      applyRealtimeKanbanDelta(changes[KANBAN_REALTIME_DELTA_KEY].newValue);
    }
  });

  closeDetails();
  loadTodos();
});
