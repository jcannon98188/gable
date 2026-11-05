import { computed, signal } from "@gable/core";
import { BehaviorSubject, Subject } from "rxjs";

export const count = signal(0);
const doubled = computed(() => count() * 2);
export const events = new Subject<number>();
let latest = new BehaviorSubject<string>("");

export function use() {
  return [doubled, latest];
}
