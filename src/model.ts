import type { Settings } from './types';
export type { Settings } from './types';

export interface Todo { id: string; text: string; date: string; done: boolean }
export type TodoChange =
  | { type: 'add'; todo: Todo }
  | { type: 'set-done'; id: string; done: boolean }
  | { type: 'remove'; id: string };
export const TODO_KEY = 'zelender.todos.v1';
export const SETTINGS_KEY = 'zelender.settings.v1';
const defaultSettings: Settings = { view: 'room', weather: 'sunny', sidebarOpacity: 0.28, sound: false };

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day, 12)) === value;
}

/** Monday-first full six-week grid; local noon avoids midnight DST transitions. */
export function calendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, i + 1 - offset, 12));
}

export function parseTodos(raw: unknown): Todo[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const todo = item as Record<string, unknown>;
    if (typeof todo.id !== 'string' || !todo.id || seen.has(todo.id) ||
        typeof todo.text !== 'string' || !todo.text.trim() || todo.text.length > 500 ||
        !validDateKey(todo.date) || typeof todo.done !== 'boolean') return [];
    seen.add(todo.id);
    return [{ id: todo.id, text: todo.text, date: todo.date, done: todo.done }];
  });
}

function read(key: string): unknown {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as unknown : null;
  } catch { return null; }
}

function write(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

/** A failed read must not replace still-unsaved tasks with an empty list. */
export function readTodos(): Todo[] | null {
  try {
    const stored = localStorage.getItem(TODO_KEY);
    return parseTodos(stored ? JSON.parse(stored) as unknown : []);
  } catch { return null; }
}

/** Replay pending edits against the latest snapshot from another new tab. */
export function applyTodoChanges(todos: Todo[], changes: TodoChange[]): Todo[] {
  return changes.reduce((current, change) => {
    if (change.type === 'add') return current.some(todo => todo.id === change.todo.id) ? current : [...current, { ...change.todo }];
    if (change.type === 'remove') return current.filter(todo => todo.id !== change.id);
    return current.map(todo => todo.id === change.id ? { ...todo, done: change.done } : todo);
  }, [...todos]);
}

export function loadTodos(): Todo[] { return readTodos() ?? []; }
export function saveTodos(todos: Todo[]): boolean { return write(TODO_KEY, parseTodos(todos)); }

export function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return { ...defaultSettings };
  const saved = value as Record<string, unknown>;
  return {
    view: saved.view === 'pond' ? 'pond' : 'room',
    weather: saved.weather === 'rain' || saved.weather === 'snow' ? saved.weather : 'sunny',
    sidebarOpacity: typeof saved.sidebarOpacity === 'number' && Number.isFinite(saved.sidebarOpacity)
      ? (saved.appearanceVersion !== 2 && saved.sidebarOpacity === 0.48 ? 0.28 : Math.min(0.85, Math.max(0.15, saved.sidebarOpacity))) : defaultSettings.sidebarOpacity,
    sound: saved.sound === true,
  };
}
export function loadSettings(): Settings { return parseSettings(read(SETTINGS_KEY)); }
export function saveSettings(settings: Settings): boolean { return write(SETTINGS_KEY, { ...parseSettings({ ...settings, appearanceVersion: 2 }), appearanceVersion: 2 }); }
