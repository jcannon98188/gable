import { computed, hotState, signal } from "@gable/core";
import { Observable, Subject } from "rxjs";

export const count = hotState(import.meta, "count", () => signal(0));
export const events = hotState(import.meta, "events", () => new Subject<number>());
export const label = "fixed";
export const stream: Observable<number> = new Observable<number>();

export function make() {
  const local = signal(0);
  return computed(() => local() + 1);
}

export class Holder {
  static scope = "root";
  n = signal(0);
}
