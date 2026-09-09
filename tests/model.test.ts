import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTodoChanges, calendarDays, dateKey, validDateKey, parseTodos, parseSettings, loadTodos, readTodos, saveTodos, loadSettings, saveSettings, TODO_KEY, SETTINGS_KEY, type TodoChange } from '../src/model.ts';

test('calendar is Monday-first and crosses December/January correctly', () => {
  const dates = calendarDays(2026, 0);
  assert.equal(dates.length, 42);
  assert.equal(dateKey(dates[0]), '2025-12-29');
  assert.equal(dates[0].getDay(), 1);
  assert.equal(dateKey(dates.at(-1)!), '2026-02-08');
});

test('calendar includes leap day and date keys reject impossible dates', () => {
  assert.equal(calendarDays(2028, 1).filter(d => dateKey(d) === '2028-02-29').length, 1);
  assert.equal(validDateKey('2028-02-29'), true);
  assert.equal(validDateKey('2026-02-29'), false);
  assert.equal(validDateKey('2026-13-02'), false);
  assert.equal(validDateKey('2100-02-29'), false);
  assert.equal(validDateKey('2000-02-29'), true);
  assert.equal(validDateKey('2026-04-31'), false);
  assert.equal(validDateKey('2026-00-09'), false);
  assert.equal(validDateKey('2026-09-00'), false);
});

test('calendar navigation normalizes months across both year boundaries', () => {
  assert.deepEqual(calendarDays(2026, -1), calendarDays(2025, 11));
  assert.deepEqual(calendarDays(2026, 12), calendarDays(2027, 0));
  const march = calendarDays(2026, 2);
  assert.equal(new Set(march.map(dateKey)).size, 42);
  assert.equal(march.filter(date => date.getMonth() === 2).length, 31);
  assert.ok(march.every(date => date.getHours() === 12));
});

test('stored tasks keep valid content and reject corrupt records and duplicate IDs', () => {
  const valid = { id: 'one', text: '<b>read</b>', date: '2026-09-09', done: false };
  assert.deepEqual(parseTodos([null, valid, valid, { ...valid, id: 'two', date: 'bad' }, { ...valid, id: 'three', done: 'true' }]), [valid]);
  assert.deepEqual(parseTodos('invalid'), []);
});

test('settings validate enums and clamp transparency', () => {
  assert.deepEqual(parseSettings({ view: 'invalid', weather: 'typhoon', sidebarOpacity: 100, sound: 'false' }), {
    view: 'room', weather: 'sunny', sidebarOpacity: 0.85, sound: false,
  });
  assert.equal(parseSettings({sidebarOpacity:NaN}).sidebarOpacity, 0.28);
  assert.equal(parseSettings({sidebarOpacity:0.48}).sidebarOpacity, 0.28, 'old default gets the more transparent appearance');
  assert.equal(parseSettings({sidebarOpacity:0.48,appearanceVersion:2}).sidebarOpacity, 0.48, 'new explicit choice is preserved');
  assert.equal(parseSettings({sidebarOpacity:0.63}).sidebarOpacity, 0.63, 'custom existing opacity is preserved');
  assert.equal(parseSettings({weather:'mist'}).weather, 'mist', 'saved mist preference remains valid');
});

test('local storage failures do not crash organizer', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); }
  } });
  try { assert.deepEqual(loadTodos(), []); assert.equal(readTodos(), null); assert.equal(saveTodos([]), false); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('pending task edits merge with another tab without losing tasks or reviving deleted ones', () => {
  const ownTask = { id: 'own', text: 'Unsent task', date: '2026-09-09', done: false };
  const remoteTask = { id: 'remote', text: 'Another tab', date: '2026-09-10', done: false };
  const pending: TodoChange[] = [
    { type: 'add', todo: ownTask },
    { type: 'set-done', id: 'own', done: true },
    { type: 'set-done', id: 'deleted-elsewhere', done: true },
  ];
  const result = applyTodoChanges([remoteTask], pending);
  assert.deepEqual(result, [remoteTask, { ...ownTask, done: true }]);
  assert.deepEqual(applyTodoChanges(result, pending), result, 'retries must be idempotent');
  assert.deepEqual(applyTodoChanges(result, [{ type: 'remove', id: 'own' }]), [remoteTask]);
  assert.equal(ownTask.done, false, 'rendered snapshots must not be mutated');
});

test('tasks and settings survive reload and corrupt saved JSON recovers safely', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { return entries.get(key) ?? null; },
    setItem(key: string, value: string) { entries.set(key, value); },
  } });
  try {
    const todos = [
      { id: 'today', text: '<script>literal task text</script>', date: '2026-09-09', done: false },
      { id: 'tomorrow', text: 'Tomorrow', date: '2026-09-10', done: true },
    ];
    assert.equal(saveTodos(todos), true);
    assert.deepEqual(loadTodos(), todos);
    const settings = { view: 'pond', weather: 'rain', sidebarOpacity: 0.6, sound: false } as const;
    assert.equal(saveSettings(settings), true);
    assert.deepEqual(loadSettings(), settings);
    const mistSettings = { ...settings, weather: 'mist' } as const;
    assert.equal(saveSettings(mistSettings), true);
    assert.deepEqual(loadSettings(), mistSettings, 'mist survives a storage round trip');
    entries.set(TODO_KEY, '{broken');
    entries.set(SETTINGS_KEY, 'null');
    assert.deepEqual(loadTodos(), []);
    assert.deepEqual(loadSettings(), parseSettings(null));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
