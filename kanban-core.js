// kanban-core.js

const KanbanAPI = (function() {
  const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);
  const statuses = ['backlog', 'todo', 'doing', 'done'];
  const priorityOptions = ['low', 'med', 'high', 'urgent'];
  const departmentOptions = ['Fiscal', 'DP', 'Recepção', 'Contabil', 'Legal', 'Administrativo'];
  const recurrenceTypes = ['none', 'daily', 'weekly', 'monthly'];
  const nativeAttachmentAllowedExtensions = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
    'zip', 'rar', '7z',
    'txt', 'csv', 'xml', 'json', 'html', 'htm'
  ];

  function getSafeHttpUrl(value) {
    try {
      const parsed = new URL(String(value || '').trim());
      if (!/^(https?|file):$/i.test(parsed.protocol)) return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function sanitizePlainText(value, maxLength = 500) {
    const text = String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    return text.slice(0, maxLength);
  }

  function normalizeSearchText(value) {
    return sanitizePlainText(value, 200).toLocaleLowerCase('pt-BR');
  }

  function normalizePriority(value) {
    const priority = sanitizePlainText(value || '', 20).toLowerCase();
    return priorityOptions.includes(priority) ? priority : 'med';
  }

  function normalizeTag(value) {
    return sanitizePlainText(value, 24);
  }

  function normalizeDepartment(value) {
    const department = sanitizePlainText(value, 60);
    if (!department) return '';
    const normalizedTarget = normalizeSearchText(department);
    const knownDepartment = departmentOptions.find((option) => normalizeSearchText(option) === normalizedTarget);
    return knownDepartment || department;
  }

  function normalizeDepartments(values, legacyDepartment = '') {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];
    [...source, legacyDepartment].forEach((value) => {
      const department = normalizeDepartment(value);
      if (!department) return;
      const key = normalizeSearchText(department);
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(department);
    });
    return normalized;
  }

  function normalizeDueAt(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
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
        return {
          id: rawId || fallbackId,
          label,
          url: safeUrl
        };
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  function normalizeRecurrence(value) {
    if (!value || typeof value !== 'object') return { type: 'none', lastTrigger: 0 };
    const type = recurrenceTypes.includes(value.type) ? value.type : 'none';
    const lastTrigger = Number(value.lastTrigger) || 0;
    return { type, lastTrigger };
  }

  function normalizeTodo(todo, fallbackIndex) {
    if (!todo || typeof todo !== 'object') return null;
    const text = sanitizePlainText(todo.text, 200);
    if (!text) return null;
    const createdAt = Number(todo.createdAt) || Date.now();
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
      status,
      priority: normalizePriority(todo.priority),
      departments: normalizeDepartments(todo.departments, todo.department),
      department: normalizeDepartment(todo.department || ''),
      dueAt: normalizeDueAt(todo.dueAt),
      tags,
      attachments: normalizeAttachments(todo.attachments),
      description: sanitizePlainText(todo.description || '', 2000),
      sprintId: sanitizePlainText(todo.sprintId || '', 40),
      isBacklog: Boolean(todo.isBacklog) || status === 'backlog',
      recurrence: normalizeRecurrence(todo.recurrence)
    };
  }

  function normalizeTodoList(todos) {
    return (Array.isArray(todos) ? todos : [])
      .map((todo, index) => normalizeTodo(todo, index))
      .filter(Boolean);
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

  // Native Messaging Functions
  function requestNativeFileAttachment() {
    return new Promise((resolve) => {
      try {
        browserAPI.runtime.sendMessage({
          type: 'pickNativeFileAttachment',
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
          code: 'NATIVE_PICK_FAILED',
          message: String(error && error.message ? error.message : 'falha-ao-selecionar-arquivo')
        });
      }
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

  class KanbanStore {
    constructor() {
      this.todos = [];
      this.orderByStatus = { backlog: [], todo: [], doing: [], done: [] };
      this.department = '';
      this.listeners = [];
    }

    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    notify() {
      this.listeners.forEach(listener => listener(this.todos, this.orderByStatus, this.department));
    }

    async load() {
      return new Promise((resolve) => {
        browserAPI.storage.local.get(['userTodos', 'kanbanOrderByStatus', 'browserDepartment'], (result) => {
          this.todos = normalizeTodoList(result.userTodos || []);
          this.checkRecurrences();
          this.orderByStatus = normalizeOrderByStatus(result.kanbanOrderByStatus, this.todos);
          this.department = normalizeDepartment(result.browserDepartment || '');
          this.notify();
          resolve({ todos: this.todos, orderByStatus: this.orderByStatus, department: this.department });
        });
      });
    }

    checkRecurrences() {
      const now = Date.now();
      let hasNew = false;
      const clones = [];

      this.todos.forEach(todo => {
        if (todo.recurrence && todo.recurrence.type !== 'none') {
          let interval = 0;
          if (todo.recurrence.type === 'daily') interval = 24 * 60 * 60 * 1000;
          if (todo.recurrence.type === 'weekly') interval = 7 * 24 * 60 * 60 * 1000;
          if (todo.recurrence.type === 'monthly') interval = 30 * 24 * 60 * 60 * 1000;

          const lastTime = todo.recurrence.lastTrigger || todo.createdAt;
          if (now - lastTime >= interval) {
            hasNew = true;
            todo.recurrence.lastTrigger = now;
            
            // Clone the task
            const clone = { 
              ...todo, 
              id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
              status: todo.isBacklog ? 'backlog' : 'todo',
              completed: false,
              createdAt: now,
              recurrence: { ...todo.recurrence, lastTrigger: 0 } // Child doesn't recur or starts fresh
            };
            clones.push(clone);
          }
        }
      });

      if (hasNew) {
        this.todos.push(...clones);
        this.save(this.todos);
      }
    }

    save(newTodos, newOrderByStatus) {
      const normalizedTodos = normalizeTodoList(newTodos);
      const normalizedTodosState = normalizedTodos.map(todo => ({
        ...todo,
        completed: todo.status === 'done'
      }));
      const normalizedOrder = normalizeOrderByStatus(newOrderByStatus || this.orderByStatus, normalizedTodosState);

      this.todos = normalizedTodosState;
      this.orderByStatus = normalizedOrder;

      browserAPI.storage.local.set({
        userTodos: this.todos,
        kanbanOrderByStatus: this.orderByStatus
      });
      
      this.notify();
    }
  }

  return {
    KanbanStore,
    utils: {
      normalizeTodo,
      normalizeTodoList,
      normalizeOrderByStatus,
      normalizeDepartment,
      normalizeDepartments,
      normalizePriority,
      normalizeTag,
      getSafeHttpUrl,
      sanitizePlainText,
      normalizeSearchText
    },
    constants: {
      statuses,
      priorityOptions,
      departmentOptions,
      recurrenceTypes,
      nativeAttachmentAllowedExtensions
    },
    native: {
      requestNativeFileAttachment,
      requestOpenNativeFileAttachment
    }
  };
})();

