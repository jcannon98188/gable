import { html, signal } from "@gable/core";
import { Observable } from "rxjs";

interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export class Fixable {
  static meta = {
    selector: "x-fixable",
    template: html`
      <p>{{ count }}</p>
      <p>{{ count() + 1 }}</p>
      <p>{{ label(count()) }}</p>
      <p>{{ shout() }}</p>
      <p>{{ user$.name + '!' }}</p>
      <button [attr.aria-expanded]="count() ? 'true' : 'false'">more</button>
      @for (todo of todos(); track todo.id) {
        <li>{{ todo.title + (todo.done ? ' (done)' : '') }}</li>
        <li>{{ describe(todo) }}</li>
      }
      @for (n of numbers(); track n) {
        <b>{{ n + 1 }}</b>
      }
    `,
  };

  count = signal(0);
  numbers = signal([1, 2, 3]);
  todos = signal<Todo[]>([]);
  user$ = new Observable<{ name: string }>();
  label(n: number): string {
    return `#${n}`;
  }
  shout(): string {
    return "hey";
  }
  describe(todo: Todo): string {
    return todo.title;
  }
}
