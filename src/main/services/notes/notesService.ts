import { v4 as uuid } from 'uuid';
import { focusStore } from '../store';
import type { Note } from '../../../shared/schema/index';

export const notesService = {
  list(): Note[] {
    return focusStore.get('notes');
  },

  get(id: string): Note | null {
    return focusStore.get('notes').find(n => n.id === id) ?? null;
  },

  create(opts: { title?: string; content?: string }): Note {
    const now = Date.now();
    const note: Note = {
      id: uuid(),
      title: opts.title ?? 'Untitled',
      content: opts.content ?? '',
      capturedFromIds: [],
      createdAt: now,
      updatedAt: now,
    };
    focusStore.addNote(note);
    return note;
  },

  update(id: string, patch: Partial<Note>): Note {
    focusStore.updateNote(id, { ...patch, updatedAt: Date.now() });
    return focusStore.get('notes').find(n => n.id === id)!;
  },

  delete(id: string): void {
    focusStore.set('notes', focusStore.get('notes').filter(n => n.id !== id));
  },
};
