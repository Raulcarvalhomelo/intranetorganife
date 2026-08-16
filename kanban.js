const browserAPI = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
const THEME_STORAGE_KEY = 'themeMode';
const KANBAN_SHOW_BACKLOG_KEY = 'kanbanShowBacklog';
const KANBAN_REALTIME_DELTA_KEY = 'kanbanRealtimeDelta';
const KANBAN_WIP_LIMITS_KEY = 'kanbanWipLimits';
const KANBAN_AGING_STALE_DAYS_KEY = 'kanbanAgingStaleDays';
const KANBAN_NOTIFICATION_LOG_KEY = 'kanbanNotificationLog';

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
  const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
  const filtersPopover = document.getElementById('filtersPopover');
  const openQuickTaskBtn = document.getElementById('openQuickTaskBtn');
  const quickTaskPopover = document.getElementById('quickTaskPopover');
  const quickTaskTitleInput = document.getElementById('quickTaskTitleInput');
  const quickTaskPriorityInput = document.getElementById('quickTaskPriorityInput');
  const quickTaskDepartmentInput = document.getElementById('quickTaskDepartmentInput');
  const quickTaskTagsInput = document.getElementById('quickTaskTagsInput');
  const quickTaskSprintInput = document.getElementById('quickTaskSprintInput');
  const cancelQuickTaskBtn = document.getElementById('cancelQuickTaskBtn');
  const toggleBacklogBtn = document.getElementById('toggleBacklogBtn');
  const clearBtn = document.getElementById('clearCompletedTodos');
  const toggleAllBtn = document.getElementById('toggleAllTodos');
  const kanbanDetailsPanel = document.getElementById('kanbanDetailsPanel');
  const closeKanbanDetailsBtn = document.getElementById('closeKanbanDetailsBtn');
  const taskTitleInput = document.getElementById('taskTitleInput');
  const taskAssignedToInput = document.getElementById('taskAssignedToInput');
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
  const taskDependsOnInput = document.getElementById('taskDependsOnInput');
  const openDependencyPickerBtn = document.getElementById('openDependencyPickerBtn');
  const dependencyPickerCountLabel = document.getElementById('dependencyPickerCountLabel');
  const dependencyPickerModal = document.getElementById('dependencyPickerModal');
  const dependencyPickerCancelBtn = document.getElementById('dependencyPickerCancelBtn');
  const dependencyPickerApplyBtn = document.getElementById('dependencyPickerApplyBtn');
  const taskDependsOnSearchInput = document.getElementById('taskDependsOnSearchInput');
  const taskDependsOnSuggestions = document.getElementById('taskDependsOnSuggestions');
  const taskDependsOnList = document.getElementById('taskDependsOnList');
  const cancelTaskDetailsBtn = document.getElementById('cancelTaskDetailsBtn');
  const saveTaskDetailsBtn = document.getElementById('saveTaskDetailsBtn');
  const kanbanToastStack = document.getElementById('kanbanToastStack');

  if (
    !kanbanOverlay || !kanbanBoard || !closeKanbanBtn
    || !kanbanBacklogList || !kanbanTodoList || !kanbanDoingList || !kanbanDoneList
    || !kanbanColumnCountBacklog || !kanbanColumnCountTodo || !kanbanColumnCountDoing || !kanbanColumnCountDone
    || !todoSearchInput || !priorityFilterInput || !departmentFilterInput || !tagFilterInput || !sprintFilterInput
    || !toggleFiltersBtn || !filtersPopover || !openQuickTaskBtn || !quickTaskPopover
    || !quickTaskTitleInput || !quickTaskPriorityInput || !quickTaskDepartmentInput || !quickTaskTagsInput || !quickTaskSprintInput || !cancelQuickTaskBtn
    || !toggleBacklogBtn || !clearBtn || !toggleAllBtn
    || !kanbanDetailsPanel || !closeKanbanDetailsBtn
    || !taskTitleInput || !taskAssignedToInput || !taskPrioritySelect || !taskDepartmentSelect || !addTaskDepartmentBtn || !taskDepartmentsList
    || !taskDueDateInput || !taskTagInput || !addTaskTagBtn || !taskTagsList
    || !taskAttachmentLabelInput || !taskAttachmentUrlInput || !pickTaskAttachmentFileBtn || !addTaskAttachmentBtn || !taskAttachmentsList
    || !taskDescriptionInput || !taskRecurrenceSelect || !taskSprintInput || !taskDependsOnInput || !openDependencyPickerBtn
    || !dependencyPickerCountLabel || !dependencyPickerModal || !dependencyPickerCancelBtn || !dependencyPickerApplyBtn
    || !taskDependsOnSearchInput || !taskDependsOnSuggestions || !taskDependsOnList || !cancelTaskDetailsBtn || !saveTaskDetailsBtn
  ) {
    return;
  }

  initTheme();

  const statuses = ['backlog', 'todo', 'doing', 'done'];
  const syncStatuses = ['todo', 'doing', 'done'];
  const priorityOptions = ['low', 'med', 'high', 'urgent'];
  const recurrenceTypes = ['none', 'daily', 'weekly', 'monthly'];
  const statusLabels = { backlog: 'Backlog', todo: 'A fazer', doing: 'Em andamento', done: 'Concluído' };
  const priorityLabels = { low: 'Baixa', med: 'Média', high: 'Alta', urgent: 'Urgente' };
  const recurrenceLabels = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
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
  const healthByStatus = {
    backlog: document.getElementById('kanbanColumnHealthBacklog'),
    todo: document.getElementById('kanbanColumnHealthTodo'),
    doing: document.getElementById('kanbanColumnHealthDoing'),
    done: document.getElementById('kanbanColumnHealthDone')
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
  let wipLimitsState = {};
  let detailsTodoId = '';
  let detailsDraftDepartments = [];
  let detailsDraftTags = [];
  let detailsDraftAttachments = [];
  let detailsDraftDependsOn = [];
  let dependencyPickerSelection = [];
  let isDependencyPickerOpen = false;
  let currentUserDepartment = '';
  let currentBrowserUser = '';
  let pendingChanges = [];
  let isSyncInProgress = false;
  let isFiltersPopoverOpen = false;
  let isQuickTaskPopoverOpen = false;
  let agingStaleDays = 3;
  let notificationLogState = {};

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

  function normalizeDependsOn(values, currentId = '') {
    const current = sanitizePlainText(currentId || '', 80);
    const source = Array.isArray(values)
      ? values
      : String(values || '').split(',');
    const seen = new Set();
    const normalized = [];
    source.forEach((value) => {
      const id = sanitizePlainText(value || '', 80);
      if (!id || id === current || seen.has(id)) return;
      seen.add(id);
      normalized.push(id);
    });
    return normalized.slice(0, 20);
  }

  function normalizeTodo(todo, fallbackIndex = 0) {
    if (!todo || typeof todo !== 'object' || !KanbanAPI || !KanbanAPI.utils || typeof KanbanAPI.utils.normalizeTodo !== 'function') return null;
    const normalized = KanbanAPI.utils.normalizeTodo(Object.assign({}, todo, { text: todo.text || todo.title }), fallbackIndex);
    if (!normalized) return null;
    const id = sanitizePlainText(todo.id || normalized.id, 80) || normalized.id;
    return {
      ...normalized,
      id,
      deleted: Number(todo.deleted) ? 1 : 0,
      completed: normalized.status === 'done',
      dependsOn: normalizeDependsOn(todo.dependsOn !== undefined && todo.dependsOn !== null ? todo.dependsOn : todo.depends_on, id),
      assignedTo: sanitizePlainText(todo.assignedTo !== undefined && todo.assignedTo !== null ? todo.assignedTo : (todo.assigned_to || ''), 80) || null,
      isBacklog: normalized.status === 'backlog' || Boolean(todo.isBacklog)
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

  function canManageDependencyByDepartment(dependencyTodo) {
    const activeDepartment = getActiveDepartmentForSync();
    const scopedDepartment = normalizeSearchText(activeDepartment);
    if (!scopedDepartment) return Boolean(dependencyTodo);
    if (!dependencyTodo) return false;
    return getTodoDepartments(dependencyTodo).some((department) => normalizeSearchText(department) === scopedDepartment);
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

  function formatCardAuditInfo(todo) {
    const createdLabel = `Criado ${formatTodoDate(todo.createdAt)}`;
    const updatedAt = Number(todo.updatedAt) || 0;
    const createdAt = Number(todo.createdAt) || 0;
    if (updatedAt > createdAt) {
      return `${createdLabel} · Editado ${formatTodoDate(updatedAt)}`;
    }
    return createdLabel;
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

  function closeFiltersPopover() {
    isFiltersPopoverOpen = false;
    filtersPopover.hidden = true;
    toggleFiltersBtn.setAttribute('aria-expanded', 'false');
  }

  function openFiltersPopover() {
    isFiltersPopoverOpen = true;
    filtersPopover.hidden = false;
    toggleFiltersBtn.setAttribute('aria-expanded', 'true');
  }

  function closeQuickTaskPopover() {
    isQuickTaskPopoverOpen = false;
    quickTaskPopover.hidden = true;
    openQuickTaskBtn.setAttribute('aria-expanded', 'false');
    quickTaskTitleInput.value = '';
    quickTaskPriorityInput.value = 'med';
    quickTaskDepartmentInput.value = '';
    quickTaskTagsInput.value = '';
    quickTaskSprintInput.value = '';
  }

  function openQuickTaskPopover() {
    const activeDepartment = getActiveDepartmentForSync();
    isQuickTaskPopoverOpen = true;
    quickTaskPopover.hidden = false;
    openQuickTaskBtn.setAttribute('aria-expanded', 'true');
    quickTaskPriorityInput.value = 'med';
    quickTaskDepartmentInput.value = activeDepartment || '';
    quickTaskTitleInput.focus();
  }

  function createTodoFromQuickTask() {
    const text = sanitizePlainText(quickTaskTitleInput.value, 200);
    if (!text) {
      quickTaskTitleInput.focus();
      showToast('Informe um título para criar a tarefa.', 'warning');
      return;
    }
    const createdAt = Date.now();
    const id = `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
    const activeDepartment = getActiveDepartmentForSync();
    const selectedDepartment = sanitizePlainText(quickTaskDepartmentInput.value, 60);
    const primaryDepartment = selectedDepartment || activeDepartment || '';
    const departments = primaryDepartment ? [primaryDepartment] : [];
    const parsedTags = sanitizePlainText(quickTaskTagsInput.value, 300)
      .split(',')
      .map((value) => normalizeTag(value))
      .filter(Boolean)
      .slice(0, 10);
    const status = showBacklog ? 'backlog' : 'todo';
    const assignedTo = getCurrentBrowserUser();
    const newTodo = {
      id,
      text,
      completed: false,
      createdAt,
      updatedAt: createdAt,
      deleted: 0,
      status,
      isBacklog: status === 'backlog',
      priority: normalizePriority(quickTaskPriorityInput.value),
      departments,
      department: primaryDepartment,
      dueAt: 0,
      tags: parsedTags,
      attachments: [],
      description: '',
      recurrence: { type: 'none', lastTrigger: 0 },
      sprintId: sanitizePlainText(quickTaskSprintInput.value, 40),
      dependsOn: [],
      assignedTo
    };
    todosState = [...todosState, newTodo];
    orderByStatusState[status] = [...orderByStatusState[status], id];
    saveTodos(todosState);
    void syncCardChange(serializeTodoForSync(newTodo));
    showToast('Tarefa criada com sucesso.', 'success');
    closeQuickTaskPopover();
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

  function getCurrentBrowserUser() {
    return sanitizePlainText(currentBrowserUser || '', 80) || null;
  }

  function normalizeWipLimits(value) {
    if (!value || typeof value !== 'object') return {};
    const normalized = {};
    statuses.forEach((status) => {
      const limit = Number(value[status]);
      if (Number.isFinite(limit) && limit > 0) {
        normalized[status] = Math.floor(limit);
      }
    });
    return normalized;
  }

  function showToast(message, type = 'info', durationMs = 2600) {
    if (!kanbanToastStack || !message) return;
    const safeType = ['success', 'warning', 'error', 'info'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `kanban-toast kanban-toast-${safeType}`;
    toast.textContent = String(message);
    kanbanToastStack.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (toast.parentNode === kanbanToastStack) {
          kanbanToastStack.removeChild(toast);
        }
      }, 220);
    }, durationMs);
  }

  function getLocalDateToken(timestamp = Date.now()) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function notifyUser(message, options = {}) {
    const safeMessage = sanitizePlainText(message || '', 240);
    if (!safeMessage) return;
    const key = sanitizePlainText(options.key || '', 120) || safeMessage;
    const today = getLocalDateToken();
    if (notificationLogState[key] === today) return;
    notificationLogState[key] = today;
    browserAPI.storage.local.set({ [KANBAN_NOTIFICATION_LOG_KEY]: notificationLogState });
    showToast(safeMessage, options.type || 'info');
    if (options.system && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Kanban', { body: safeMessage });
      } catch {
        return;
      }
    }
  }

  function runDeadlineNotifications() {
    const todayStart = getStartOfToday();
    const dayMs = 24 * 60 * 60 * 1000;
    todosState.forEach((todo) => {
      if (!todo || todo.status === 'done') return;
      const dueAt = Number(todo.dueAt) || 0;
      if (!dueAt) return;
      const dayDiff = Math.floor((dueAt - todayStart) / dayMs);
      if (dayDiff === 1) {
        notifyUser(`Tarefa "${todo.text}" vence amanhã.`, {
          key: `due-soon-${todo.id}`,
          type: 'warning',
          system: false
        });
      }
      if (dayDiff < 0) {
        const overdueDays = Math.abs(dayDiff);
        notifyUser(`Tarefa "${todo.text}" atrasada há ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}.`, {
          key: `due-overdue-${todo.id}-${overdueDays}`,
          type: 'error',
          system: false
        });
      }
    });
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
    const assignedTo = sanitizePlainText(source.assignedTo !== undefined && source.assignedTo !== null ? source.assignedTo : (source.assigned_to !== undefined && source.assigned_to !== null ? source.assigned_to : ''), 80);
    return {
      id: sanitizePlainText(source.id || '', 80),
      title: sanitizePlainText(source.text || source.title || '', 200),
      description: sanitizePlainText(source.description || '', 2000),
      status: statusToSync,
      priority: normalizePriority(source.priority),
      due_at: normalizeDueAt(source.dueAt),
      tags: (Array.isArray(source.tags) ? source.tags : []).map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10),
      attachments: normalizeAttachments(source.attachments),
      sprint_id: sanitizePlainText(source.sprintId !== undefined && source.sprintId !== null ? source.sprintId : (source.sprint_id !== undefined && source.sprint_id !== null ? source.sprint_id : ''), 80),
      recurrence: normalizeRecurrence(source.recurrence),
      depends_on: normalizeDependsOn(source.dependsOn !== undefined && source.dependsOn !== null ? source.dependsOn : source.depends_on, source.id),
      assigned_to: assignedTo || null,
      assigned_to_display: assignedTo || null,
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
    const incomingUpdatedAt = toNumberOrZero(cardInput.updated_at !== undefined && cardInput.updated_at !== null ? cardInput.updated_at : cardInput.updatedAt) || Date.now();
    const incomingCreatedAt = toNumberOrZero(cardInput.created_at !== undefined && cardInput.created_at !== null ? cardInput.created_at : cardInput.createdAt) || incomingUpdatedAt;
    const normalizedList = normalizeTodoList([{
      ...cardInput,
      text: cardInput.title || cardInput.text || '',
      dueAt: cardInput.due_at !== undefined && cardInput.due_at !== null ? cardInput.due_at : cardInput.dueAt,
      sprintId: cardInput.sprint_id !== undefined && cardInput.sprint_id !== null ? cardInput.sprint_id : cardInput.sprintId,
      updatedAt: incomingUpdatedAt,
      createdAt: incomingCreatedAt,
      recurrence: cardInput.recurrence && typeof cardInput.recurrence === 'object'
        ? cardInput.recurrence
        : { type: 'none', lastTrigger: 0 },
      dependsOn: cardInput.depends_on !== undefined && cardInput.depends_on !== null ? cardInput.depends_on : cardInput.dependsOn,
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
      const incomingUpdatedAt = toNumberOrZero(incomingCard.updated_at !== undefined && incomingCard.updated_at !== null ? incomingCard.updated_at : incomingCard.updatedAt);
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
        const existingTodo = nextTodos[existingIndex];
        const mergedDependsOn = normalizedCard.dependsOn && normalizedCard.dependsOn.length
          ? normalizedCard.dependsOn
          : normalizeDependsOn(existingTodo && existingTodo.dependsOn, normalizedCard.id);
        nextTodos[existingIndex] = { ...normalizedCard, dependsOn: mergedDependsOn };
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
        notifyUser(`Nova tarefa recorrente criada: "${clone.text}".`, {
          key: `recurrence-created-${todo.id}-${now}`,
          type: 'info',
          system: false
        });
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
        updatedAt: Number(card.updated_at !== undefined && card.updated_at !== null ? card.updated_at : card.updatedAt) || Date.now(),
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
          const currentDependsOn = normalizeDependsOn(merged[existingIndex].dependsOn, card.id);
          const incomingDependsOn = normalizeDependsOn(card.dependsOn, card.id);
          merged[existingIndex] = { ...card, dependsOn: incomingDependsOn.length ? incomingDependsOn : currentDependsOn };
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
    browserAPI.storage.local.get([
      'userTodos',
      'kanbanOrderByStatus',
      'browserDepartment',
      'browserUser',
      'pendingChanges',
      KANBAN_SHOW_BACKLOG_KEY,
      KANBAN_WIP_LIMITS_KEY,
      KANBAN_AGING_STALE_DAYS_KEY,
      KANBAN_NOTIFICATION_LOG_KEY
    ], (result) => {
      todosState = normalizeTodoList(result.userTodos || []);
      orderByStatusState = normalizeOrderByStatus(result.kanbanOrderByStatus, todosState);
      currentUserDepartment = sanitizePlainText(result.browserDepartment || '', 60);
      currentBrowserUser = sanitizePlainText(result.browserUser || '', 80);
      pendingChanges = Array.isArray(result.pendingChanges) ? result.pendingChanges.filter((entry) => entry && entry.id) : [];
      showBacklog = typeof result[KANBAN_SHOW_BACKLOG_KEY] === 'boolean' ? result[KANBAN_SHOW_BACKLOG_KEY] : true;
      wipLimitsState = normalizeWipLimits(result[KANBAN_WIP_LIMITS_KEY]);
      const staleDaysFromStorage = Number(result[KANBAN_AGING_STALE_DAYS_KEY]);
      agingStaleDays = Number.isFinite(staleDaysFromStorage) && staleDaysFromStorage > 0 ? Math.floor(staleDaysFromStorage) : 3;
      notificationLogState = result[KANBAN_NOTIFICATION_LOG_KEY] && typeof result[KANBAN_NOTIFICATION_LOG_KEY] === 'object'
        ? result[KANBAN_NOTIFICATION_LOG_KEY]
        : {};
      checkRecurrences();
      renderTodos();
      runDeadlineNotifications();
      void flushPendingChanges();
      void refreshKanbanCardsFromServer();
    });
  }

  function getDueClass(dueAt) {
    if (dueAt < getStartOfToday()) return 'kanban-due-overdue';
    if (isSameLocalDay(dueAt, Date.now())) return 'kanban-due-today';
    return '';
  }

  function isTodoOverdue(todo, todayStart) {
    if (!todo || todo.status === 'done') return false;
    return Number(todo.dueAt) > 0 && Number(todo.dueAt) < todayStart;
  }

  function getTodoAgingInfo(todo, todayStart) {
    const dueAt = Number(todo && todo.dueAt) || 0;
    const updatedAt = Number(todo && todo.updatedAt) || Number(todo && todo.createdAt) || Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const overdueDays = dueAt > 0 && dueAt < todayStart && todo.status !== 'done'
      ? Math.floor((todayStart - dueAt) / dayMs)
      : 0;
    const staleAfterDays = Number.isFinite(agingStaleDays) && agingStaleDays > 0 ? agingStaleDays : 3;
    const staleDays = todo.status !== 'done' ? Math.floor((todayStart - updatedAt) / dayMs) : 0;
    const isStale = staleDays >= staleAfterDays;
    return { overdueDays, staleDays, isStale, staleAfterDays };
  }

  function getTodoDependencyState(todo) {
    const dependsOn = normalizeDependsOn(todo && todo.dependsOn, todo && todo.id);
    if (!dependsOn.length) {
      return { dependsOn: [], unresolved: [], isBlocked: false };
    }
    const unresolved = dependsOn.filter((dependencyId) => {
      const dependencyTodo = getTodoById(dependencyId);
      if (!dependencyTodo) return true;
      return dependencyTodo.status !== 'done';
    });
    return { dependsOn, unresolved, isBlocked: unresolved.length > 0 };
  }

  function validateDependsOnForSave(rawValue, currentId) {
    const normalized = normalizeDependsOn(rawValue, currentId);
    const current = sanitizePlainText(currentId || '', 80);
    const existingIds = new Set(
      todosState
        .map((todo) => sanitizePlainText(todo && todo.id ? todo.id : '', 80))
        .filter((id) => id && id !== current)
    );
    const invalidIds = normalized.filter((id) => !existingIds.has(id));
    return {
      dependsOn: normalized,
      invalidIds,
      isValid: invalidIds.length === 0
    };
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
    const recurrenceLabel = recurrenceLabels[recurrenceType] || recurrenceType;
    const todayStart = getStartOfToday();
    const hasDueDate = Number(todo.dueAt) > 0;
    const dueClass = hasDueDate ? getDueClass(todo.dueAt) : '';
    const hasOverdue = isTodoOverdue(todo, todayStart);
    const agingInfo = getTodoAgingInfo(todo, todayStart);
    const dependencyState = getTodoDependencyState(todo);
    const auditInfo = formatCardAuditInfo(todo);
    const assignedTo = sanitizePlainText(todo.assignedTo || '', 80);
    const contextBadges = [
      ...departments.map((department) => `<span class="kanban-context-chip">${department}</span>`),
      ...tags.slice(0, 3).map((tag) => `<span class="kanban-tag-chip">${tag}</span>`)
    ];
    const supportBadges = [
      todo.attachments.length ? `<span class="kanban-card-support-chip">🔗 ${todo.attachments.length}</span>` : '',
      todo.description ? '<span class="kanban-card-support-chip">📝 Observação</span>' : '',
      todo.sprintId ? `<span class="kanban-card-support-chip">Sprint #${todo.sprintId}</span>` : '',
      recurrenceType !== 'none' ? `<span class="kanban-card-support-chip recurrence-badge">🕒 ${recurrenceLabel}</span>` : '',
      dependencyState.dependsOn.length ? `<span class="kanban-card-support-chip">🔗 ${dependencyState.dependsOn.length} dependência(s)</span>` : ''
    ].filter(Boolean);
    const overdueLabel = agingInfo.overdueDays > 0
      ? `${agingInfo.overdueDays} ${agingInfo.overdueDays === 1 ? 'dia atrasado' : 'dias atrasados'}`
      : '';
    card.classList.toggle('kanban-card-overdue', hasOverdue);
    card.classList.toggle('kanban-card-stale', agingInfo.isStale);
    card.classList.toggle('kanban-card-blocked', dependencyState.isBlocked);

    card.innerHTML = `
      <div class="kanban-card-header">
        <div class="kanban-card-title">${todo.text}</div>
      </div>
      <div class="kanban-card-main-meta">
        <span class="kanban-priority-badge kanban-priority-${todo.priority}">${priorityLabels[todo.priority] || 'Média'}</span>
        ${hasDueDate ? `<span class="kanban-card-deadline ${dueClass}">📅 ${formatDueDate(todo.dueAt)}</span>` : ''}
        ${hasOverdue ? '<span class="kanban-card-overdue-flag">Atrasado</span>' : ''}
        ${overdueLabel ? `<span class="kanban-card-aging-flag">${overdueLabel}</span>` : ''}
        ${agingInfo.isStale ? `<span class="kanban-card-stale-flag">${agingInfo.staleDays} dias sem mover</span>` : ''}
        ${dependencyState.isBlocked ? `<span class="kanban-card-blocked-flag">Bloqueado por dependência</span>` : ''}
      </div>
      ${assignedTo ? `<div class="kanban-card-responsible">👤 ${assignedTo}</div>` : ''}
      ${contextBadges.length ? `<div class="kanban-card-context">${contextBadges.join('')}</div>` : ''}
      ${supportBadges.length ? `<div class="kanban-card-indicators">${supportBadges.join('')}</div>` : ''}
      <div class="kanban-card-meta">
        <span class="kanban-card-date">${auditInfo}</span>
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
    const healthEl = healthByStatus[status];
    if (!list || !countEl) return;
    list.innerHTML = '';
    const allItems = getSortedTodosForStatus(status).filter((todo) => isTodoInActiveDepartment(todo));
    const items = allItems.filter((todo) => matchesFilters(todo));
    const todayStart = getStartOfToday();
    const itemCount = allItems.length;
    const overdueCount = allItems.filter((todo) => isTodoOverdue(todo, todayStart)).length;
    const wipLimit = Number(wipLimitsState[status]) || 0;
    const isOverWip = wipLimit > 0 && itemCount > wipLimit;
    countEl.textContent = wipLimit > 0 ? `${itemCount}/${wipLimit}` : String(itemCount);
    if (healthEl) {
      if (isOverWip && overdueCount > 0) {
        healthEl.textContent = `⚠ ${overdueCount} atrasados · acima do limite`;
      } else if (isOverWip) {
        healthEl.textContent = '⚠ acima do limite';
      } else if (overdueCount > 0) {
        healthEl.textContent = `⚠ ${overdueCount} atrasados`;
      } else {
        healthEl.textContent = '';
      }
    }
    const column = list.closest('.kanban-column');
    if (column) {
      column.classList.toggle('kanban-column-has-overdue', overdueCount > 0);
      column.classList.toggle('kanban-column-over-wip', isOverWip);
    }
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
    detailsDraftDependsOn = [];
    dependencyPickerSelection = [];
    taskTitleInput.value = '';
    taskAssignedToInput.value = '';
    taskPrioritySelect.value = 'med';
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = '';
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = '';
    taskRecurrenceSelect.value = 'none';
    taskSprintInput.value = '';
    taskDependsOnInput.value = '';
    taskDependsOnSearchInput.value = '';
    closeDependencyPicker();
    closeDependencySuggestions();
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
    renderDetailsDependsOn();
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

  function closeDependencySuggestions() {
    taskDependsOnSuggestions.innerHTML = '';
  }

  function updateDependencyPickerCountLabel() {
    const count = normalizeDependsOn(detailsDraftDependsOn, detailsTodoId).length;
    dependencyPickerCountLabel.textContent = `${count} selecionada${count === 1 ? '' : 's'}`;
  }

  function closeDependencyPicker(options = {}) {
    const shouldApply = Boolean(options && options.apply);
    if (shouldApply) {
      const currentNormalized = normalizeDependsOn(detailsDraftDependsOn, detailsTodoId);
      const preservedDependencies = currentNormalized.filter((dependencyId) => {
        const dependencyTodo = getTodoById(dependencyId);
        if (!dependencyTodo) return true;
        return !canManageDependencyByDepartment(dependencyTodo);
      });
      const selectedDependencies = normalizeDependsOn(dependencyPickerSelection, detailsTodoId)
        .filter((dependencyId) => Boolean(getTodoById(dependencyId)));
      detailsDraftDependsOn = normalizeDependsOn([...preservedDependencies, ...selectedDependencies], detailsTodoId);
      renderDetailsDependsOn();
    }
    isDependencyPickerOpen = false;
    dependencyPickerModal.classList.remove('is-open');
    dependencyPickerModal.setAttribute('aria-hidden', 'true');
    taskDependsOnSearchInput.value = '';
    closeDependencySuggestions();
  }

  function openDependencyPicker() {
    if (!detailsTodoId) return;
    dependencyPickerSelection = normalizeDependsOn(detailsDraftDependsOn, detailsTodoId);
    isDependencyPickerOpen = true;
    dependencyPickerModal.classList.add('is-open');
    dependencyPickerModal.setAttribute('aria-hidden', 'false');
    taskDependsOnSearchInput.value = '';
    renderDependencySuggestions('');
    taskDependsOnSearchInput.focus();
  }

  function toggleDependencySelection(dependencyId, checked) {
    const id = sanitizePlainText(dependencyId || '', 80);
    if (!id || !detailsTodoId) return;
    const nextSelection = new Set(normalizeDependsOn(dependencyPickerSelection, detailsTodoId));
    if (checked) {
      if (id === detailsTodoId) return;
      if (!getTodoById(id)) return;
      nextSelection.add(id);
    } else {
      nextSelection.delete(id);
    }
    dependencyPickerSelection = [...nextSelection];
  }

  function getDependencyCandidates(searchTerm = '') {
    const currentId = sanitizePlainText(detailsTodoId || '', 80);
    const normalizedTerm = normalizeSearchText(searchTerm);
    return todosState
      .filter((todo) => todo && todo.id && sanitizePlainText(todo.id, 80) !== currentId)
      .filter((todo) => isTodoInActiveDepartment(todo))
      .filter((todo) => {
        if (!normalizedTerm) return true;
        const departmentsLabel = getTodoDepartments(todo).join(', ');
        const searchable = normalizeSearchText([
          todo.text || '',
          todo.id || '',
          todo.sprintId || '',
          statusLabels[todo.status] || todo.status || '',
          priorityLabels[todo.priority] || todo.priority || '',
          departmentsLabel
        ].join(' '));
        return searchable.includes(normalizedTerm);
      })
      .slice(0, 120);
  }

  function renderDependencySuggestions(searchTerm = taskDependsOnSearchInput.value) {
    if (!detailsTodoId || !isDependencyPickerOpen) {
      closeDependencySuggestions();
      return;
    }
    const candidates = getDependencyCandidates(searchTerm);
    const selected = new Set(normalizeDependsOn(dependencyPickerSelection, detailsTodoId));
    taskDependsOnSuggestions.innerHTML = '';
    if (!candidates.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhum card encontrado';
      taskDependsOnSuggestions.appendChild(empty);
      return;
    }
    candidates.forEach((todo) => {
      const option = document.createElement('label');
      option.className = 'kanban-dependency-option';
      option.dataset.dependencyId = sanitizePlainText(todo.id || '', 80);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'kanban-dependency-option-check';
      checkbox.checked = selected.has(option.dataset.dependencyId);
      checkbox.addEventListener('change', () => {
        toggleDependencySelection(option.dataset.dependencyId, checkbox.checked);
      });
      const content = document.createElement('span');
      content.className = 'kanban-dependency-option-content';
      const title = document.createElement('span');
      title.className = 'kanban-dependency-option-title';
      title.textContent = sanitizePlainText(todo.text || '', 200) || 'Sem título';
      const meta = document.createElement('span');
      meta.className = 'kanban-dependency-option-meta';
      const priorityLabel = priorityLabels[todo.priority] || priorityLabels.med;
      const statusLabel = statusLabels[todo.status] || todo.status || '';
      const departmentsLabel = getTodoDepartments(todo).join(', ') || 'Sem departamento';
      meta.textContent = `${priorityLabel} - ${statusLabel} - ${departmentsLabel}`;
      const idNode = document.createElement('span');
      idNode.className = 'kanban-dependency-option-id';
      idNode.textContent = `#${option.dataset.dependencyId}`;
      content.appendChild(title);
      content.appendChild(meta);
      option.appendChild(checkbox);
      option.appendChild(content);
      option.appendChild(idNode);
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      taskDependsOnSuggestions.appendChild(option);
    });
  }

  function buildDependencyChipText(dependencyTodo) {
    if (!dependencyTodo) {
      return 'Dependência indisponível para este departamento';
    }
    const title = sanitizePlainText(dependencyTodo.text || '', 200) || 'Card sem título';
    const priorityLabel = priorityLabels[dependencyTodo.priority] || priorityLabels.med;
    const statusLabel = statusLabels[dependencyTodo.status] || dependencyTodo.status || 'Sem status';
    const departmentsLabel = getTodoDepartments(dependencyTodo).join(', ') || 'Sem departamento';
    return `${title} - ${priorityLabel} - ${statusLabel} - ${departmentsLabel}`;
  }

  function renderDetailsDependsOn() {
    taskDependsOnList.innerHTML = '';
    const normalized = normalizeDependsOn(detailsDraftDependsOn, detailsTodoId);
    detailsDraftDependsOn = normalized;
    taskDependsOnInput.value = normalized.join(', ');
    updateDependencyPickerCountLabel();
    if (!normalized.length) {
      const empty = document.createElement('div');
      empty.className = 'kanban-empty-inline';
      empty.textContent = 'Nenhuma dependência selecionada';
      taskDependsOnList.appendChild(empty);
      return;
    }
    normalized.forEach((dependencyId) => {
      const dependencyTodo = getTodoById(dependencyId);
      const canRemove = canManageDependencyByDepartment(dependencyTodo);
      const chip = document.createElement('span');
      chip.className = `kanban-chip kanban-dependency-chip${dependencyTodo ? '' : ' kanban-chip-invalid'}`;
      const text = document.createElement('span');
      text.className = 'kanban-chip-text';
      text.textContent = buildDependencyChipText(dependencyTodo);
      chip.appendChild(text);
      if (canRemove) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'kanban-chip-remove';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remover dependência';
        removeBtn.addEventListener('click', () => {
          detailsDraftDependsOn = detailsDraftDependsOn.filter((id) => id !== dependencyId);
          renderDetailsDependsOn();
          renderDependencySuggestions(taskDependsOnSearchInput.value);
        });
        chip.appendChild(removeBtn);
      }
      taskDependsOnList.appendChild(chip);
    });
  }

  function addDraftDependency(dependencyId) {
    const id = sanitizePlainText(dependencyId || '', 80);
    if (!id) return false;
    if (!detailsTodoId) return false;
    const currentId = sanitizePlainText(detailsTodoId || '', 80);
    if (id === currentId) {
      showToast('Um card não pode depender dele mesmo.', 'warning');
      return false;
    }
    if (detailsDraftDependsOn.includes(id)) return false;
    if (detailsDraftDependsOn.length >= 20) {
      showToast('Limite de 20 dependências por card.', 'warning');
      return false;
    }
    if (!getTodoById(id)) {
      showToast('Selecione apenas cards existentes.', 'warning');
      return false;
    }
    detailsDraftDependsOn = [...detailsDraftDependsOn, id];
    renderDetailsDependsOn();
    taskDependsOnSearchInput.value = '';
    renderDependencySuggestions('');
    return true;
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
      showToast('Não foi possível abrir o arquivo.', 'error');
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
    detailsDraftDependsOn = normalizeDependsOn(todo.dependsOn, todo.id);
    taskTitleInput.value = todo.text;
    taskAssignedToInput.value = todo.assignedTo || getCurrentBrowserUser() || '';
    taskPrioritySelect.value = todo.priority;
    taskDepartmentSelect.value = '';
    taskDueDateInput.value = toInputDateValue(todo.dueAt);
    taskTagInput.value = '';
    taskAttachmentLabelInput.value = '';
    taskAttachmentUrlInput.value = '';
    taskDescriptionInput.value = todo.description || '';
    taskRecurrenceSelect.value = normalizeRecurrence(todo.recurrence).type;
    taskSprintInput.value = todo.sprintId || '';
    taskDependsOnInput.value = detailsDraftDependsOn.join(', ');
    taskDependsOnSearchInput.value = '';
    dependencyPickerSelection = normalizeDependsOn(detailsDraftDependsOn, detailsTodoId);
    closeDependencyPicker();
    closeDependencySuggestions();
    renderDetailsDepartments();
    renderDetailsTags();
    renderDetailsAttachments();
    renderDetailsDependsOn();
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
      showToast('Não foi possível selecionar o arquivo.', 'error');
      alert(`Não foi possível selecionar o arquivo.${result && result.message ? `\n${result.message}` : ''}`);
      return;
    }
    const safeUrl = getSafeHttpUrl(result.fileUrl || '');
    if (!safeUrl) {
      showToast('O arquivo selecionado não gerou link válido.', 'error');
      alert('O arquivo selecionado não gerou um link válido.');
      return;
    }
    taskAttachmentLabelInput.value = sanitizePlainText(result.fileName || '', 40) || taskAttachmentLabelInput.value;
    taskAttachmentUrlInput.value = safeUrl;
    addDraftAttachment();
    if (!result.isNetworkPath) {
      showToast('Arquivo local pode não funcionar para outros usuários.', 'warning');
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
      showToast('Informe um título para salvar.', 'warning');
      return;
    }
    const nextPriority = normalizePriority(taskPrioritySelect.value);
    const nextAssignedTo = sanitizePlainText(taskAssignedToInput.value, 80) || null;
    const nextDepartments = normalizeDepartments(detailsDraftDepartments);
    const nextDepartment = nextDepartments[0] || '';
    const nextDueAt = fromInputDateValue(taskDueDateInput.value);
    const nextDescription = sanitizePlainText(taskDescriptionInput.value, 2000);
    const nextTags = detailsDraftTags.map((tag) => normalizeTag(tag)).filter(Boolean).slice(0, 10);
    const nextAttachments = normalizeAttachments(detailsDraftAttachments);
    const recurrenceType = recurrenceTypes.includes(taskRecurrenceSelect.value) ? taskRecurrenceSelect.value : 'none';
    const nextSprintId = sanitizePlainText(taskSprintInput.value, 40);
    const dependencyValidation = validateDependsOnForSave(detailsDraftDependsOn, detailsTodoId);
    if (!dependencyValidation.isValid) {
      openDependencyPicker();
      taskDependsOnSearchInput.focus();
      showToast(`Dependências inválidas: ${dependencyValidation.invalidIds.join(', ')}.`, 'warning');
      return;
    }
    const nextDependsOn = dependencyValidation.dependsOn;
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
          dependsOn: nextDependsOn,
          assignedTo: nextAssignedTo,
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
    showToast('Tarefa salva com sucesso.', 'success');
    closeDetails();
  }

  function moveTodo(todoId, nextStatus) {
    if (!statuses.includes(nextStatus)) return;
    const movedTodo = getTodoById(todoId);
    if (!movedTodo) return;
    if (nextStatus === 'done') {
      const dependencyState = getTodoDependencyState(movedTodo);
      if (dependencyState.isBlocked) {
        showToast('Não é possível concluir: existem dependências pendentes.', 'warning');
        return;
      }
    }
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
    if (nextStatus === 'done') {
      showToast('Tarefa concluída.', 'success');
    } else {
      showToast(`Card movido para ${statusLabels[nextStatus] || nextStatus}.`, 'info');
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
    showToast('Tarefa removida.', 'warning');
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

  toggleFiltersBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isFiltersPopoverOpen) {
      closeFiltersPopover();
      return;
    }
    closeQuickTaskPopover();
    openFiltersPopover();
  });

  openQuickTaskBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isQuickTaskPopoverOpen) {
      closeQuickTaskPopover();
      return;
    }
    closeFiltersPopover();
    openQuickTaskPopover();
  });

  cancelQuickTaskBtn.addEventListener('click', () => {
    closeQuickTaskPopover();
  });

  quickTaskPopover.addEventListener('submit', (event) => {
    event.preventDefault();
    createTodoFromQuickTask();
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
    const plural = doneTodos.length > 1 ? 'tarefas concluídas removidas' : 'tarefa concluída removida';
    showToast(`${doneTodos.length} ${plural}.`, 'success');
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
    let blockedDoneCount = 0;
    todosState = todosState.map((todo) => {
      const dependencyState = target === 'done' ? getTodoDependencyState(todo) : { isBlocked: false };
      const isBlocked = Boolean(dependencyState.isBlocked);
      if (target === 'done' && isBlocked) {
        blockedDoneCount += 1;
      }
      return {
        ...todo,
        status: target === 'done' && isBlocked ? todo.status : target,
        isBacklog: target === 'done' && isBlocked ? todo.isBacklog : false,
        completed: target === 'done' ? !isBlocked : false,
        updatedAt
      };
    });
    syncStatusAndOrder();
    saveTodos(todosState);
    todosState.forEach((todo) => {
      void syncCardChange(serializeTodoForSync(todo));
    });
    if (target === 'done') {
      const doneCount = todosState.filter((todo) => todo.status === 'done').length;
      showToast(`${doneCount} tarefas concluídas.`, 'success');
      if (blockedDoneCount > 0) {
        showToast(`${blockedDoneCount} card(s) ficaram pendentes por dependências.`, 'warning');
      }
    } else {
      showToast('Todas as tarefas voltaram para A fazer.', 'info');
    }
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
        showToast('Não foi possível atualizar o Kanban.', 'error');
        alert(`Não foi possível atualizar o Kanban.${result && result.message ? `\n${result.message}` : ''}`);
        return;
      }
      showToast('Kanban atualizado com sucesso.', 'success');
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
  openDependencyPickerBtn.addEventListener('click', () => {
    openDependencyPicker();
  });
  dependencyPickerCancelBtn.addEventListener('click', () => {
    closeDependencyPicker();
  });
  dependencyPickerApplyBtn.addEventListener('click', () => {
    closeDependencyPicker({ apply: true });
  });
  dependencyPickerModal.addEventListener('click', (event) => {
    if (event.target === dependencyPickerModal) {
      closeDependencyPicker();
    }
  });
  taskDependsOnSearchInput.addEventListener('input', () => {
    renderDependencySuggestions(taskDependsOnSearchInput.value);
  });
  taskDependsOnSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDependencyPicker();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const firstOption = taskDependsOnSuggestions.querySelector('.kanban-dependency-option');
    if (!firstOption || !firstOption.dataset || !firstOption.dataset.dependencyId) return;
    const checkbox = firstOption.querySelector('.kanban-dependency-option-check');
    const nextChecked = checkbox ? !checkbox.checked : true;
    toggleDependencySelection(firstOption.dataset.dependencyId, nextChecked);
    renderDependencySuggestions(taskDependsOnSearchInput.value);
  });
  taskAttachmentUrlInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftAttachment();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (isFiltersPopoverOpen && !filtersPopover.contains(target) && !toggleFiltersBtn.contains(target)) {
      closeFiltersPopover();
    }
    if (isQuickTaskPopoverOpen && !quickTaskPopover.contains(target) && !openQuickTaskBtn.contains(target)) {
      closeQuickTaskPopover();
    }
    if (!dependencyPickerModal.contains(target) && !openDependencyPickerBtn.contains(target) && isDependencyPickerOpen) {
      closeDependencyPicker();
    }
    if (!taskDependsOnSuggestions.contains(target) && !taskDependsOnSearchInput.contains(target) && !isDependencyPickerOpen) {
      closeDependencySuggestions();
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
      if (status === 'done') {
        const dependencyState = getTodoDependencyState(movedTodo);
        if (dependencyState.isBlocked) {
          showToast('Não é possível concluir: existem dependências pendentes.', 'warning');
          renderTodos();
          return;
        }
      }
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
      if (status === 'done') {
        showToast('Tarefa concluída.', 'success');
      } else {
        showToast(`Card movido para ${statusLabels[status] || status}.`, 'info');
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
      if (!isQuickTaskPopoverOpen) {
        closeFiltersPopover();
        openQuickTaskPopover();
      } else {
        quickTaskTitleInput.focus();
      }
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
      if (isFiltersPopoverOpen) {
        closeFiltersPopover();
      }
      if (isQuickTaskPopoverOpen) {
        closeQuickTaskPopover();
      }
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
    if (changes.browserUser) {
      currentBrowserUser = sanitizePlainText(changes.browserUser.newValue || '', 80);
    }
    if (changes.themeMode) {
      applyTheme(changes.themeMode.newValue);
    }
    if (changes[KANBAN_REALTIME_DELTA_KEY]) {
      applyRealtimeKanbanDelta(changes[KANBAN_REALTIME_DELTA_KEY].newValue);
    }
    if (changes[KANBAN_WIP_LIMITS_KEY]) {
      wipLimitsState = normalizeWipLimits(changes[KANBAN_WIP_LIMITS_KEY].newValue);
      renderTodos();
    }
    if (changes[KANBAN_AGING_STALE_DAYS_KEY]) {
      const nextValue = Number(changes[KANBAN_AGING_STALE_DAYS_KEY].newValue);
      agingStaleDays = Number.isFinite(nextValue) && nextValue > 0 ? Math.floor(nextValue) : 3;
      renderTodos();
    }
    if (changes[KANBAN_NOTIFICATION_LOG_KEY]) {
      notificationLogState = changes[KANBAN_NOTIFICATION_LOG_KEY].newValue && typeof changes[KANBAN_NOTIFICATION_LOG_KEY].newValue === 'object'
        ? changes[KANBAN_NOTIFICATION_LOG_KEY].newValue
        : {};
    }
  });

  closeDetails();
  loadTodos();
});
