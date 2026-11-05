import { computed, html, inject, signal } from "@gable/core";
import { CounterStore } from "./counter-store.js";

export class Counter {
  static meta = {
    selector: "app-counter",
    template: html`
      <p class="my-4">Count: {{ count() }} (doubled: {{ doubled() }})</p>
      <button class="inc rounded bg-sky-600 px-3 py-1 text-white" (click)="increment()">+1</button>
      <button class="save rounded border px-3 py-1" (click)="save()">Save</button>
      @if (status()) {
        <p class="saved mt-4">{{ status() }}</p>
      }
    `,
  };

  store = inject(CounterStore);
  count = signal(0);
  doubled = computed(() => this.count() * 2);
  status = computed(() => {
    const saved = this.store.saved();
    return saved === null ? "" : `Saved: ${saved}`;
  });

  increment() {
    this.count.update((n) => n + 1);
  }

  save() {
    this.store.save(this.count());
  }
}
