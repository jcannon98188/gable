import { signal } from "@gable/core";

/** A root-scoped service: one instance for the whole app, shared by every component that injects it. */
export class CounterStore {
  static scope = "root";

  saved = signal<number | null>(null);

  save(value: number) {
    this.saved.set(value);
  }
}
