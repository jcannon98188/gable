import { html, inject, signal } from '@gable/core';
import { TodoStore } from '../services/todo-store.js';
import { TodoItem } from './todo-item.js';

const ENTER_KEY = 'Enter';

export class TodoApp {
  static meta = {
    selector: 'app-root',
    imports: [TodoItem],
    template: html`
      <section class="todoapp">
        <header class="header">
          <h1>todos</h1>
          <input
            class="new-todo"
            placeholder="What needs to be done?"
            autofocus
            [value]="draft()"
            (input)="draft.set($event.currentTarget.value)"
            (keydown)="onKeydown($event.key)"
          />
        </header>
        @if (store.hasTodos()) {
          <section class="main">
            <input
              id="toggle-all"
              class="toggle-all"
              type="checkbox"
              [checked]="store.allCompleted()"
              (change)="store.toggleAll($event.currentTarget.checked)"
            />
            <label for="toggle-all">Mark all as complete</label>
            <ul class="todo-list">
              @for (todo of store.visible(); track todo.id) {
                <li app-todo-item [todo]="todo"></li>
              }
            </ul>
          </section>
          <footer class="footer">
            <span class="todo-count"><strong>{{ store.remaining() }}</strong> {{ store.itemWord() }} left</span>
            <ul class="filters">
              <li><a href="#/" [class.selected]="store.allSelected()">All</a></li>
              <li><a href="#/active" [class.selected]="store.activeSelected()">Active</a></li>
              <li><a href="#/completed" [class.selected]="store.completedSelected()">Completed</a></li>
            </ul>
            @if (store.hasCompleted()) {
              <button class="clear-completed" (click)="store.clearCompleted()">Clear completed</button>
            }
          </footer>
        }
      </section>
    `,
  };

  store = inject(TodoStore);
  draft = signal('');

  onKeydown(key: string): void {
    if (key === ENTER_KEY && this.store.add(this.draft())) this.draft.set('');
  }
}
