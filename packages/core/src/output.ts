import { Observable, Subject } from "rxjs";
import { currentScope } from "./scope.js";

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

/**
 * Declares a component output. Use it as a field initialiser and call `emit` to send a value; the parent listens with `(name)="handler($event)"`. The emitter is completed when the component is destroyed.
 *
 * @typeParam T - The type of the emitted value; `void` for an output that carries nothing.
 * @returns A new {@link OutputEmitter}.
 *
 * @example
 * ```ts
 * export class SaveButton {
 *   static meta = {
 *     selector: "app-save-button",
 *     template: html`<button (click)="onClick()">Save</button>`,
 *   };
 *
 *   saved = output<string>();
 *
 *   onClick(): void {
 *     this.saved.emit("now");
 *   }
 * }
 * ```
 */
export function output<T = void>(): OutputEmitter<T> {
  return new OutputEmitter<T>();
}

/** Completes an output when its component is destroyed. */
export function completeOutput(out: OutputEmitter<unknown>): void {
  subjects.get(out)?.complete();
}
