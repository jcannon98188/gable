import { computed, effect, inject, signal } from '@gable/core';
import { Router } from '@gable/core/router';
import { matchesFilter, parseTodos, type Filter, type Todo } from '../models/todo.js';
import { TodoStorage } from './todo-storage.js';

/** All todo state: the list, the active filter (from the route), and persistence. */
export class TodoStore {
  static scope = 'root';

  storage = inject(TodoStorage);
  router = inject(Router);

  todos = signal<Todo[]>(parseTodos(this.storage.load()));
  filter = computed<Filter>(() => (this.router.data()['filter'] as Filter | undefined) ?? 'all');

  visible = computed(() => this.todos().filter((t) => matchesFilter(t, this.filter())));
  hasTodos = computed(() => this.todos().length > 0);
  remaining = computed(() => this.todos().filter((t) => !t.completed).length);
  hasCompleted = computed(() => this.todos().some((t) => t.completed));
  allCompleted = computed(() => this.hasTodos() && this.remaining() === 0);
  itemWord = computed(() => (this.remaining() === 1 ? 'item' : 'items'));
  allSelected = computed(() => this.filter() === 'all');
  activeSelected = computed(() => this.filter() === 'active');
  completedSelected = computed(() => this.filter() === 'completed');

  persist = effect(() => this.storage.save(JSON.stringify(this.todos())));

  add(title: string): boolean {
    const trimmed = title.trim();
    if (!trimmed) return false;
    this.todos.update((list) => [...list, { id: crypto.randomUUID(), title: trimmed, completed: false }]);
    return true;
  }

  setCompleted(id: string, completed: boolean): void {
    this.#patch(id, { completed });
  }

  /** Saves a new title; an empty one removes the todo. */
  rename(id: string, title: string): void {
    const trimmed = title.trim();
    if (trimmed) this.#patch(id, { title: trimmed });
    else this.remove(id);
  }

  remove(id: string): void {
    this.todos.update((list) => list.filter((t) => t.id !== id));
  }

  toggleAll(completed: boolean): void {
    this.todos.update((list) => list.map((t) => ({ ...t, completed })));
  }

  clearCompleted(): void {
    this.todos.update((list) => list.filter((t) => !t.completed));
  }

  #patch(id: string, change: Partial<Todo>): void {
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }
}
