import Store from 'electron-store';
import type { StoreData } from '../../shared/schema/index';
import { STORE_SCHEMA, DEFAULT_SETTINGS } from '../../shared/schema/index';

class FocusStore {
  private store: Store<StoreData>;

  constructor() {
    this.store = new Store<StoreData>({
      name: 'focus-os-store',
      schema: STORE_SCHEMA as any,
      defaults: {
        captures: [],
        notes: [],
        todos: [],
        calendarEvents: [],
        emails: [],
        categories: [],
        settings: DEFAULT_SETTINGS,
      },
    });
  }

  get<K extends keyof StoreData>(key: K): StoreData[K] {
    return this.store.get(key) as StoreData[K];
  }

  set<K extends keyof StoreData>(key: K, value: StoreData[K]): void {
    this.store.set(key, value);
  }

  // ── Capture helpers ────────────────────────────────────────────────────
  addCapture(c: import('../../shared/schema/index').Capture) {
    this.set('captures', [c, ...this.get('captures')]);
  }

  updateCapture(id: string, patch: Partial<import('../../shared/schema/index').Capture>) {
    this.set('captures', this.get('captures').map(c => c.id === id ? { ...c, ...patch } : c));
  }

  // ── Note helpers ───────────────────────────────────────────────────────
  addNote(n: import('../../shared/schema/index').Note) {
    this.set('notes', [n, ...this.get('notes')]);
  }

  updateNote(id: string, patch: Partial<import('../../shared/schema/index').Note>) {
    this.set('notes', this.get('notes').map(n => n.id === id ? { ...n, ...patch } : n));
  }

  // ── Todo helpers ───────────────────────────────────────────────────────
  addTodo(t: import('../../shared/schema/index').Todo) {
    this.set('todos', [t, ...this.get('todos')]);
  }

  updateTodo(id: string, patch: Partial<import('../../shared/schema/index').Todo>) {
    this.set('todos', this.get('todos').map(t => t.id === id ? { ...t, ...patch } : t));
  }

  // ── Calendar helpers ───────────────────────────────────────────────────
  addCalendarEvent(e: import('../../shared/schema/index').CalendarEvent) {
    this.set('calendarEvents', [...this.get('calendarEvents'), e]);
  }

  // ── Email helpers ──────────────────────────────────────────────────────
  upsertEmail(e: import('../../shared/schema/index').EmailDigestItem) {
    const existing = this.get('emails');
    const idx = existing.findIndex(x => x.id === e.id);
    if (idx >= 0) {
      existing[idx] = e;
      this.set('emails', existing);
    } else {
      this.set('emails', [e, ...existing]);
    }
  }

  // ── Settings helpers ───────────────────────────────────────────────────
  getSettings(): import('../../shared/schema/index').Settings {
    return this.get('settings');
  }

  updateSettings(patch: Partial<import('../../shared/schema/index').Settings>) {
    this.set('settings', { ...this.get('settings'), ...patch });
    return this.get('settings');
  }
}

export const focusStore = new FocusStore();
