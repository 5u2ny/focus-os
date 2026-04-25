import { v4 as uuid } from 'uuid';
import { focusStore } from '../store';
import type { Todo } from '../../../shared/schema/index';

export const todoService = {
  list(): Todo[] {
    return focusStore.get('todos');
  },

  create(opts: { text: string; category?: string }): Todo {
    const todo: Todo = {
      id: uuid(),
      text: opts.text,
      completed: false,
      category: opts.category,
      isActive: false,
      createdAt: Date.now(),
    };
    focusStore.addTodo(todo);
    return todo;
  },

  update(id: string, patch: Partial<Todo>): Todo {
    focusStore.updateTodo(id, patch);
    return focusStore.get('todos').find(t => t.id === id)!;
  },

  setActive(id: string | null): void {
    const todos = focusStore.get('todos').map(t => ({
      ...t,
      isActive: t.id === id,
    }));
    focusStore.set('todos', todos);
  },

  delete(id: string): void {
    focusStore.set('todos', focusStore.get('todos').filter(t => t.id !== id));
  },
};
