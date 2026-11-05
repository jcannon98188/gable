import { html, signal } from "@gable/core";
import { Observable, BehaviorSubject } from "rxjs";

interface User {
  name: string;
  address: { city: string };
  friends: string[];
}

export class Observed {
  static meta = {
    selector: "x-observed",
    template: html`
      <p>{{ user$.name }} {{ user$.address.city }} {{ later }} {{ subject$ }}</p>
      @if (user$; as u) {
        <p>{{ u.name }}</p>
      }
      @for (f of user$.friends; track f) {
        <i>{{ f }}</i>
      }
      @let current = user$.address;
      <p>{{ current?.city }} {{ plain() }}</p>
      <button (click)="maybeTake(user$.name)">take</button>
      @for (item of items(); track item.id) {
        <p>{{ item.score$ }} {{ item.score$ ?? 0 }}</p>
      }
    `,
  };
  user$ = new Observable<User>();
  later = Promise.resolve({ value: 1 });
  subject$ = new BehaviorSubject(3);
  plain = signal(1);
  maybeTake(name: string | undefined): void {
    void name;
  }
  items = signal<Array<{ id: number; score$: Observable<number> }>>([]);
}
