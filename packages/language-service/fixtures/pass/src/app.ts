import { html, signal, computed } from "@gable/core";
import { Observable } from "rxjs";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export class TodoList {
  static meta = {
    selector: "todo-list",
    template: html`
      @let all = todos();
      <h1>{{ title() }} ({{ todos().length }}) {{ all.length }}</h1>
      @if (user$.name; as name) {
        <p>Hello {{ name }}</p>
      } @else if (loading()) {
        <p>Loading</p>
      } @else {
        <p>Nobody</p>
      }
      <ul>
        @for (todo of todos(); track todo.id) {
          <li [class.done]="todo.done" (click)="toggle(todo.id)">{{ todo.title }} {{ $index }}</li>
        } @empty {
          <li>Nothing to do</li>
        }
      </ul>
      @switch (mode()) {
        @case ('all') { <p>All</p> }
        @default { <p>Some</p> }
      }
      <input #box [value]="title() ?? 'none'" [(model)]="title" (input)="rename($event)" />
      <p>{{ !loading() }} {{ profile.age ?? 0 }} {{ later }}</p>
      <p [class.busy]="count() > 0 && !loading()">{{ mode() === "all" }} {{ title() !== "x" }} {{ (profile.age ?? 0) >= 18 || loading() }} {{ count() <= 1 }}</p>
    `,
  };

  title = signal("Todos");
  loading = signal(false);
  mode = signal<"all" | "open">("all");
  todos = signal<Todo[]>([]);
  count = computed(() => this.todos().length);
  user$ = new Observable<{ name: string }>();
  later = Promise.resolve(5);
  profile: { age?: number } = {};

  toggle(id: number): void {
    this.todos.update((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }
  rename(event: unknown): void {
    void event;
  }
}
