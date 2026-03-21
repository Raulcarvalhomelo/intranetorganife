const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mock browser/chrome environment
global.chrome = {
  runtime: {
    sendMessage: () => {},
    lastError: null
  },
  storage: {
    local: {
      get: () => {},
      set: () => {}
    }
  }
};
global.browser = global.chrome;

// Load kanban-core.js and force it into global scope
const corePath = path.resolve(__dirname, '../../../../kanban-core.js');
let coreCode = fs.readFileSync(corePath, 'utf8');
// Remove 'const ' to make it global OR wrap it
coreCode = coreCode.replace('const KanbanAPI =', 'global.KanbanAPI =');
eval(coreCode); 

test('KanbanAPI Core - normalizeTodo', async (t) => {
  const { normalizeTodo } = KanbanAPI.utils;

  await t.test('should handle minimal valid todo', () => {
    const raw = { text: 'Test Task' };
    const result = normalizeTodo(raw, 0);
    assert.strictEqual(result.text, 'Test Task');
    assert.strictEqual(result.status, 'todo');
    assert.strictEqual(result.priority, 'med');
    assert.ok(Array.isArray(result.attachments));
  });

  await t.test('should recover legacy department', () => {
    const raw = { text: 'Job', department: 'Fiscal' };
    const result = normalizeTodo(raw, 0);
    assert.deepStrictEqual(result.departments, ['Fiscal']);
  });

  await t.test('should handle Phase 4 fields (sprint, recurrence)', () => {
    const raw = { 
      text: 'Recur', 
      sprintId: 'Sprint-1',
      recurrence: { type: 'daily' }
    };
    const result = normalizeTodo(raw, 0);
    assert.strictEqual(result.sprintId, 'Sprint-1');
    assert.strictEqual(result.recurrence.type, 'daily');
  });
});

test('KanbanAPI Core - checkRecurrences', async (t) => {
  const store = new KanbanAPI.KanbanStore();
  
  // Create a recurring task that is overdue
  const now = Date.now();
  const past = now - (25 * 60 * 60 * 1000); // 25h ago (overdue for daily)
  
  const todo = KanbanAPI.utils.normalizeTodo({
    id: 'rec-1',
    text: 'Overdue Daily',
    recurrence: { type: 'daily', lastTrigger: past },
    createdAt: past
  });
  
  store.todos = [todo];
  
  t.test('should clone overdue task', () => {
    store.checkRecurrences();
    // One original + one clone
    assert.strictEqual(store.todos.length, 2);
    const clone = store.todos.find(t => t.id !== 'rec-1');
    assert.ok(clone, 'Clone should exist');
    assert.strictEqual(clone.text, 'Overdue Daily');
    assert.strictEqual(clone.status, 'todo');
    
    // Original lastTrigger should be updated
    assert.ok(todo.recurrence.lastTrigger >= now);
  });
});
