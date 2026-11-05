import { html, signal } from "@gable/core";

export class App {
  static meta = {
    selector: "app-root",
    template: html`<button class="inc" (click)="inc()">+</button><span class="label">Count:</span> <span class="count">{{ count() }}</span>`,
  };
  count = signal(0);
  inc() {
    this.count.update((n) => n + 1);
  }
}
