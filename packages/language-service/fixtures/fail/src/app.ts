import { html, signal } from "@gable/core";
import { Observable } from "rxjs";

export class Broken {
  static meta = {
    selector: "broken-view",
    template: html`
      <p>{{ count }}</p>
      <p>{{ cuont() }}</p>
      <p>{{ format() }}</p>
      <p>{{ user$() }}</p>
      <p>{{ count() + 1 }}</p>
      <p>{{ describe(1) }}</p>
      <p>{{ count() == 1 }}</p>
      <p>{{ count() === "one" }}</p>
      <p>{{ user$.nam }}</p>
      @for (n of count(); track n) {
        <i>{{ n }}</i>
      }
      <input [(model)]="readonlyName" />
      <button (click)="missing()">go</button>
      <p>{{ ok() }}</p>
    `,
  };

  count = signal(0);
  user$ = new Observable<{ name: string }>();
  readonlyName = (() => "x") as unknown as { (): string };
  format(): string {
    return "";
  }
  describe(): string {
    return "";
  }
  ok = signal("fine");
}
