import { Observable, Subject } from "rxjs";

const subjects = new WeakMap<object, Subject<any>>();

/**
 * A component output: an RxJS `Observable` that the owning component pushes
 * values into with `emit`. Declare it as a field: `clicked = output<string>()`.
 */
export class OutputEmitter<T> extends Observable<T> {
  constructor() {
    const subject = new Subject<T>();
    super((subscriber) => subject.subscribe(subscriber));
    subjects.set(this, subject);
  }

  emit(value: T): void {
    subjects.get(this)!.next(value);
  }
}

export function output<T = void>(): OutputEmitter<T> {
  return new OutputEmitter<T>();
}

/** Completes an output when its component is destroyed. */
export function completeOutput(out: OutputEmitter<unknown>): void {
  subjects.get(out)?.complete();
}
