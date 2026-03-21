const browserAPI = (typeof browser !== 'undefined' ? browser : chrome);

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const kanbanOverlay = document.getElementById('kanbanOverlay');
  const kanbanBoard = document.getElementById('kanbanBoard');
  const todoForm = document.getElementById('todoForm');
  const todoInput = document.getElementById('todoInput');
  const closeKanbanBtn = document.getElementById('closeKanbanBtn');
  
  // Lists
  const kanbanBacklogList = document.getElementById('kanbanBacklogList');
  const kanbanTodoList = document.getElementById('kanbanTodoList');
  const kanbanDoingList = document.getElementById('kanbanDoingList');
  const kanbanDoneList = document.getElementById('kanbanDoneList');
  
  // Counts
  const kanbanColumnCountBacklog = document.getElementById('kanbanColumnCountBacklog');
  const kanbanColumnCountTodo = document.getElementById('kanbanColumnCountTodo');
  const kanbanColumnCountDoing = document.getElementById('kanbanColumnCountDoing');
  const kanbanColumnCountDone = document.getElementById('kanbanColumnCountDone');
  
  // Filters
  const todoSearchInput = document.getElementById('todoSearchInput');
  const priorityFilterInput = document.getElementById('priorityFilterInput');
  const departmentFilterInput = document.getElementById('departmentFilterInput');
  const tagFilterInput = document.getElementById('tagFilterInput');
  const sprintFilterInput = document.getElementById('sprintFilterInput');
  const toggleBacklogBtn = document.getElementById('toggleBacklogBtn');
  
  // Actions
  const clearBtn = document.getElementById('clearCompletedTodos');
  const toggleAllBtn = document.getElementById('toggleAllTodos');
  
  // Details Panel
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

  // --- Constants & State ---
  const { statuses, priorityOptions, recurrenceTypes } = KanbanAPI.constants;
  const priorityLabels = { low: 'Baixa', med: 'Média', high: 'Alta', urgent: 'Urgente' };
  
  let todosState = [];
  let orderByStatusState = { backlog:[], todo: [], doing: [], done: [] };
  let todoSearchTerm = '';
  let priorityFilterValue = 'all';
  let departmentFilterTerm = '';
  let tagFilterTerm = '';
  let sprintFilterTerm = '';
  let showBacklog = false;
  let draggingTodoId = '';
  let detailsTodoId = '';
  let detailsDraftDepartments = [];
  let detailsDraftTags = [];
  let detailsDraftAttachments = [];

  const listByStatus = {
    backlog: kanbanBacklogList,
    todo: kanbanTodoList,
    doing: kanbanDoingList,
    done: kanbanDoneList
  };

  const countElByStatus = {
    backlog: kanbanColumnCountBacklog,
    todo: kanbanColumnCountTodo,
    doing: kanbanColumnCountDoing,
    done: kanbanColumnCountDone
  };

  // --- Core API Hooks ---
  const { normalizeTodo, sanitizePlainText, normalizeSearchText, getSafeHttpUrl, normalizePriority, normalizeTag, normalizeDepartments, normalizeAttachments } = KanbanAPI.utils;
  const kanbanStore = new KanbanAPI.KanbanStore();

  kanbanStore.subscribe((todos, order) => {
    todosState = todos;
    orderByStatusState = order;
    renderTodos();
  });

  // --- Helpers ---
  function getTodoById(id) { return todosState.find(t => t.id === id); }
  
  function getTodoDepartments(todo) {
    if (Array.isArray(todo.departments) && todo.departments.length) return todo.departments;
    if (todo.department) return [todo.department];
    return [];
  }

  function formatTodoDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatDueDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function toInputDateValue(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toISOString().split('T')[0];
  }

  function fromInputDateValue(value) {
    if (!value) return 0;
    const parts = value.split('-');
    if (parts.length < 3) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  }

  function getStartOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function isSameLocalDay(t1, t2) {
    const d1 = new Date(t1), d2 = new Date(t2);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  }

  function hasActiveFilters() {
    return !!(todoSearchTerm || priorityFilterValue !== 'all' || departmentFilterTerm || tagFilterTerm || sprintFilterTerm);
  }

  function getSortedTodosForStatus(status) {
    const order = orderByStatusState[status] || [];
    const todosInStatus = todosState.filter(t => t.status === status);
    return order
      .map(id => todosInStatus.find(t => t.id === id))
      .filter(Boolean)
      .concat(todosInStatus.filter(t => !order.includes(t.id)));
  }

  // --- UI Operations ---
  function renderTodos() {
    if (kanbanBoard) kanbanBoard.classList.toggle('hide-backlog', !showBacklog);
    statuses.forEach(renderStatusColumn);
  }

  function renderStatusColumn(status) {
    const list = listByStatus[status];
    const countEl = countElByStatus[status];
    if (!list) return;

    list.innerHTML = '';
    const items = getSortedTodosForStatus(status).filter(matchesFilters);
    
    if (countEl) countEl.textContent = items.length;

    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'kanban-empty';
      empty.textContent = hasActiveFilters() ? 'Nada encontrado' : 'Vazio';
      list.appendChild(empty);
      return;
    }

    items.forEach(todo => list.appendChild(createCard(todo)));
  }

  function matchesFilters(todo) {
    const depts = getTodoDepartments(todo);
    const searchable = normalizeSearchText([todo.text, ...depts, todo.description, ...(todo.tags || [])].join(' '));
    if (todoSearchTerm && !searchable.includes(todoSearchTerm)) return false;
    if (priorityFilterValue !== 'all' && todo.priority !== priorityFilterValue) return false;
    if (departmentFilterTerm && !depts.some(d => normalizeSearchText(d).includes(departmentFilterTerm))) return false;
    if (tagFilterTerm && !(todo.tags || []).some(t => normalizeSearchText(t).includes(tagFilterTerm))) return false;
    if (sprintFilterTerm && normalizeSearchText(todo.sprintId) !== sprintFilterTerm) return false;
    return true;
  }

  function createCard(todo) {
    const card = document.createElement('li');
    card.className = 'kanban-card';
    card.dataset.id = todo.id;
    card.setAttribute('draggable', hasActiveFilters() ? 'false' : 'true');

    card.innerHTML = `
      <div class="kanban-card-header">
        <div class="kanban-card-text">${todo.text}</div>
        <span class="kanban-priority-badge kanban-priority-${todo.priority}">${priorityLabels[todo.priority]}</span>
      </div>
      <div class="kanban-card-submeta">
        ${getTodoDepartments(todo).map(d => `<span>${d}</span>`).join('')}
        ${todo.dueAt > 0 ? `<span class="${getDueClass(todo.dueAt)}">📅 ${formatDueDate(todo.dueAt)}</span>` : ''}
      </div>
      <div class="kanban-card-tags">
        ${(todo.tags || []).slice(0, 3).map(t => `<span class="kanban-tag-chip">${t}</span>`).join('')}
      </div>
      <div class="kanban-card-indicators">
        ${todo.attachments.length ? `<span>🔗 ${todo.attachments.length}</span>` : ''}
        ${todo.description ? `<span>📝</span>` : ''}
        ${todo.recurrence && todo.recurrence.type !== 'none' ? `<span class="recurrence-badge">🕒 ${todo.recurrence.type}</span>` : ''}
      </div>
      <div class="kanban-card-meta">
        <span class="kanban-card-date">${formatTodoDate(todo.createdAt)}</span>
        <div class="kanban-card-actions">
           ${renderCardActions(todo)}
        </div>
      </div>
    `;

    // Events
    card.addEventListener('click', e => {
      if (!e.target.closest('button')) openDetails(todo.id);
    });

    card.addEventListener('dragstart', e => {
      if (hasActiveFilters()) return e.preventDefault();
      draggingTodoId = todo.id;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      draggingTodoId = '';
      card.classList.remove('dragging');
    });

    // Action buttons
    card.querySelectorAll('.action-move').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        moveTodo(todo.id, btn.dataset.target);
      };
    });

    card.querySelector('.action-delete').onclick = (e) => {
      e.stopPropagation();
      deleteTodo(todo.id);
    };

    return card;
  }

  function getDueClass(dueAt) {
    if (dueAt < getStartOfToday()) return 'kanban-due-overdue';
    if (isSameLocalDay(dueAt, Date.now())) return 'kanban-due-today';
    return '';
  }

  function renderCardActions(todo) {
    const idx = statuses.indexOf(todo.status);
    let html = '';
    if (idx > 0) html += `<button class="kanban-card-btn action-move" data-target="${statuses[idx-1]}">←</button>`;
    if (idx < statuses.length - 1) html += `<button class="kanban-card-btn action-move" data-target="${statuses[idx+1]}">→</button>`;
    html += `<button class="kanban-card-btn action-delete">×</button>`;
    return html;
  }

  function moveTodo(id, status) {
    todosState = todosState.map(t => t.id === id ? { ...t, status, completed: status === 'done' } : t);
    orderByStatusState[status].push(id);
    kanbanStore.save(todosState, orderByStatusState);
  }

  function deleteTodo(id) {
    todosState = todosState.filter(t => t.id !== id);
    kanbanStore.save(todosState, orderByStatusState);
  }

  // --- Details Panel Logic ---
  function openDetails(id) {
    const todo = getTodoById(id);
    if (!todo) return;
    detailsTodoId = id;
    detailsDraftDepartments = [...(todo.departments || [])];
    detailsDraftTags = [...(todo.tags || [])];
    detailsDraftAttachments = [...(todo.attachments || [])];

    taskTitleInput.value = todo.text;
    taskPrioritySelect.value = todo.priority;
    taskDueDateInput.value = toInputDateValue(todo.dueAt);
    taskDescriptionInput.value = todo.description || '';
    taskSprintInput.value = todo.sprintId || '';
    taskRecurrenceSelect.value = (todo.recurrence && todo.recurrence.type) || 'none';

    renderDraftLists();
    kanbanDetailsPanel.classList.add('is-open');
  }

  function closeDetails() {
    detailsTodoId = '';
    kanbanDetailsPanel.classList.remove('is-open');
  }

  function saveDetails() {
    if (!detailsTodoId) return;
    const text = sanitizePlainText(taskTitleInput.value, 200);
    if (!text) return alert('Título obrigatório');

    todosState = todosState.map(t => t.id === detailsTodoId ? {
      ...t,
      text,
      priority: taskPrioritySelect.value,
      dueAt: fromInputDateValue(taskDueDateInput.value),
      description: sanitizePlainText(taskDescriptionInput.value, 2000),
      departments: detailsDraftDepartments,
      tags: detailsDraftTags,
      attachments: detailsDraftAttachments,
      recurrence: { type: taskRecurrenceSelect.value, lastTrigger: t.recurrence ? t.recurrence.lastTrigger : 0 },
      sprintId: taskSprintInput.value
    } : t);

    kanbanStore.save(todosState, orderByStatusState);
    closeDetails();
  }

  function renderDraftLists() {
    taskDepartmentsList.innerHTML = detailsDraftDepartments.map((d, i) => `<span class="kanban-chip">${d} <button onclick="window.__removeDept(${i})">×</button></span>`).join('');
    taskTagsList.innerHTML = detailsDraftTags.map((t, i) => `<span class="kanban-chip">${t} <button onclick="window.__removeTag(${i})">×</button></span>`).join('');
    taskAttachmentsList.innerHTML = detailsDraftAttachments.map((a, i) => `
      <div class="kanban-link-item">
        <a href="${a.url}" target="_blank" class="kanban-link-anchor">${a.label}</a>
        <button onclick="window.__removeAttach(${i})">×</button>
      </div>
    `).join('');
  }

  // Global draft modifiers
  window.__removeDept = i => { detailsDraftDepartments.splice(i, 1); renderDraftLists(); };
  window.__removeTag = i => { detailsDraftTags.splice(i, 1); renderDraftLists(); };
  window.__removeAttach = i => { detailsDraftAttachments.splice(i, 1); renderDraftLists(); };

  // --- Events ---
  todoForm.onsubmit = e => {
    e.preventDefault();
    const text = sanitizePlainText(todoInput.value, 200);
    if (!text) return;
    const id = Date.now().toString();
    const newTodo = normalizeTodo({ id, text, status: 'todo' });
    todosState.push(newTodo);
    orderByStatusState.todo.push(id);
    kanbanStore.save(todosState, orderByStatusState);
    todoInput.value = '';
  };

  clearBtn.onclick = () => {
    todosState = todosState.filter(t => t.status !== 'done');
    kanbanStore.save(todosState);
  };

  toggleAllBtn.onclick = () => {
    const allDone = todosState.every(t => t.status === 'done');
    const target = allDone ? 'todo' : 'done';
    todosState = todosState.map(t => ({ ...t, status: target, completed: target === 'done' }));
    kanbanStore.save(todosState);
  };

  addTaskDepartmentBtn.onclick = () => {
    const d = taskDepartmentSelect.value;
    if (d && !detailsDraftDepartments.includes(d)) {
      detailsDraftDepartments.push(d);
      renderDraftLists();
    }
  };

  addTaskTagBtn.onclick = () => {
    const t = normalizeTag(taskTagInput.value);
    if (t && !detailsDraftTags.includes(t)) {
      detailsDraftTags.push(t);
      taskTagInput.value = '';
      renderDraftLists();
    }
  };

  addTaskAttachmentBtn.onclick = () => {
    const label = sanitizePlainText(taskAttachmentLabelInput.value, 40);
    const url = getSafeHttpUrl(taskAttachmentUrlInput.value);
    if (url) {
      detailsDraftAttachments.push({ id: Date.now().toString(), label: label || url, url });
      taskAttachmentLabelInput.value = '';
      taskAttachmentUrlInput.value = '';
      renderDraftLists();
    }
  };

  pickTaskAttachmentFileBtn.onclick = async () => {
    const res = await KanbanAPI.native.requestNativeFileAttachment();
    if (res && res.ok) {
      taskAttachmentLabelInput.value = res.fileName;
      taskAttachmentUrlInput.value = res.fileUrl;
    }
  };

  saveTaskDetailsBtn.onclick = saveDetails;
  cancelTaskDetailsBtn.onclick = closeDetails;
  closeKanbanDetailsBtn.onclick = closeDetails;
  closeKanbanBtn.onclick = () => window.location.href = 'intranet.html';

  todoSearchInput.oninput = e => { todoSearchTerm = normalizeSearchText(e.target.value); renderTodos(); };
  priorityFilterInput.onchange = e => { priorityFilterValue = e.target.value; renderTodos(); };
  departmentFilterInput.oninput = e => { departmentFilterTerm = normalizeSearchText(e.target.value); renderTodos(); };
  tagFilterInput.oninput = e => { tagFilterTerm = normalizeSearchText(e.target.value); renderTodos(); };
  sprintFilterInput.oninput = e => { sprintFilterTerm = normalizeSearchText(e.target.value); renderTodos(); };
  toggleBacklogBtn.onclick = () => { showBacklog = !showBacklog; renderTodos(); };

  // --- Drag & Drop Core ---
  statuses.forEach(status => {
    const list = listByStatus[status];
    list.addEventListener('dragover', e => {
      if (hasActiveFilters()) return;
      e.preventDefault();
      list.classList.add('drag-over');
      const draggingCard = document.querySelector('.dragging');
      const afterElement = getAfterElement(list, e.clientY);
      if (!afterElement) list.appendChild(draggingCard);
      else list.insertBefore(draggingCard, afterElement);
    });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', () => {
      list.classList.remove('drag-over');
      moveTodoToPosition(draggingTodoId, status, list);
    });
  });

  function getAfterElement(container, y) {
    const els = [...container.querySelectorAll('.kanban-card:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function moveTodoToPosition(id, status, list) {
    const cardIds = [...list.querySelectorAll('.kanban-card')].map(c => c.dataset.id);
    todosState = todosState.map(t => t.id === id ? { ...t, status, completed: status === 'done' } : t);
    orderByStatusState[status] = cardIds;
    kanbanStore.save(todosState, orderByStatusState);
  }

  // --- Shortcuts ---
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
    }
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); todoInput.focus(); }
    if (k === 'f') { e.preventDefault(); todoSearchInput.focus(); }
    if (k === 'b') { e.preventDefault(); toggleBacklogBtn.click(); }
    if (k === 'escape') closeKanbanDetailsBtn.click();
  });

  // --- Start ---
  kanbanStore.load();
});
