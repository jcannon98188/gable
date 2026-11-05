import { html, signal } from "@gable/core";
import { Observable } from "rxjs";

interface User {
  name: string;
  address: { city: string };
}

export class Observed {
  static meta = {
    selector: "x-observed",
    template: html`
      <p>{{ user$.nam }}</p>
      <p>{{ later.vlue }}</p>
      <p>{{ user$() }}</p>
      <p>{{ later() }}</p>
      <input [(value)]="user$" />
      <button (click)="take(user$.name)">take</button>
    `,
  };
  user$ = new Observable<User>();
  later = Promise.resolve({ value: 1 });
  plain = signal(1);
  take(name: string): void {
    void name;
  }
}
