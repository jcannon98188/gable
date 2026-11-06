import { computed, effect, html, inject, input, signal, viewChild } from '@gable/core';
import { TodoStore } from '../services/todo-store.js';
import type { Todo } from '../models/todo.js';

const ESCAPE_KEY = 'Escape';
const ENTER_KEY = 'Enter';

export class TodoItem {
  static meta = {
    selector: 'li[app-todo-item]',
    host: { '[class.completed]': 'completed()', '[class.editing]': 'editing()' },
    template: html`
      <div class="view">
        <input class="toggle" type="checkbox" [checked]="completed()" (change)="toggle($event)" />
        <label (dblclick)="startEditing()">{{ title() }}</label>
        <button class="destroy" (click)="remove()"></button>
      </div>
      @if (editing()) {
        <input
          class="edit"
          #editInput
          [value]="draft()"
          (input)="setDraft($event)"
          (keydown)="onKeydown($event.key)"
          (blur)="commit()"
        />
      }
    `,
  };

  store = inject(TodoStore);
  todo = input.required<Todo>();
  id = computed(() => this.todo().id);
  editInput = viewChild<HTMLInputElement>('editInput');

  completed = computed(() => this.todo().completed);
  title = computed(() => this.todo().title);
  editing = signal(false);
  draft = signal('');

  focusOnEdit = effect(() => this.editInput()?.focus?.());

  toggle(event: Event): void {
    this.store.setCompleted(this.id(), (event.target as HTMLInputElement).checked);
  }

  setDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  remove(): void {
    this.store.remove(this.id());
  }

  startEditing(): void {
    this.draft.set(this.title());
    this.editing.set(true);
  }

  onKeydown(key: string): void {
    if (key === ENTER_KEY) this.commit();
    else if (key === ESCAPE_KEY) this.editing.set(false);
  }

  /** Enter and blur both save; after either (or Escape) the edit is over, so a later blur does nothing. */
  commit(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    this.store.rename(this.id(), this.draft());
  }
}
