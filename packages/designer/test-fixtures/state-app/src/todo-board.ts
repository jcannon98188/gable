// The signal state fixture (TASK-56.17/18): an input, plain-data signals to poke and pin, a signal that is not plain data,
// a child's signal (which a Scene of TodoBoard cannot hold), and a button that makes the app fight a pin.
import { computed, html, input, signal } from "@gable/core";

export class TodoBadge {
  static meta = { selector: "app-todo-badge", template: html`<span class="badge">{{ label() }}</span>` };
  open = signal(false);
  label = computed(() => (this.open() ? "open" : "closed"));
}

export class TodoBoard {
  static meta = {
    selector: "app-todo-board",
    imports: [TodoBadge],
    template: html`
      <h1 class="title">{{ title() }}</h1>
      <p class="count">{{ count() }} items</p>
      <ul class="items">
        @for (t of items(); track t.id) {
          <li>{{ t.text }}</li>
        }
      </ul>
      <p class="ticks">ticks {{ ticks() }}</p>
      <button class="burst" (click)="burst()">Burst</button>
      <app-todo-badge></app-todo-badge>
    `,
  };
  title = input("Todos");
  items = signal<Array<{ id: number; text: string; done: boolean }>>([]);
  count = computed(() => this.items().length);
  ticks = signal(0);
  createdAt = signal(new Date(0));

  /** Writes `ticks` every 10ms for a second: fast enough that a pin on it is suspended. */
  burst(): void {
    let n = 0;
    const id = setInterval(() => {
      this.ticks.update((t) => t + 1);
      if (++n >= 100) clearInterval(id);
    }, 10);
  }
}
