// `@gable/core/rxjs`: the RxJS side of Gable. This is the only entry that
// imports RxJS (a peer dependency); the signal core and templates never do.
import { Observable, Subject, Subscription, asyncScheduler, type SchedulerAction, type SchedulerLike } from "rxjs";
import { effect, runAfterFlush, type ReadonlySignal } from "./signals.js";
import { createScope, currentScope, runInScope } from "./scope.js";

export { toSignal } from "./bridge.js";
export type { ToSignalOptions } from "./bridge.js";

/**
 * Observes a signal, flush-aligned: emits the current value on subscribe, then
 * the settled value after each coalesced flush. Intermediate writes are not seen.
 */
export function toObservable<T>(source: ReadonlySignal<T>): Observable<T> {
  const owner = currentScope();
  return new Observable<T>((subscriber) => {
    const scope = createScope(owner);
    let first = true;
    let last: T;
    runInScope(scope, () =>
      effect(() => {
        let value: T;
        try {
          value = source();
        } catch (error) {
          subscriber.error(error);
          return;
        }
        if (first || !Object.is(value, last)) subscriber.next(value);
        first = false;
        last = value;
      }),
    );
    return () => scope.dispose();
  });
}

/**
 * An RxJS scheduler tied to the render flush, for `observeOn`, `auditTime` and
 * friends. Work with no delay runs inside the next flush (after its effects);
 * delayed work falls back to the async scheduler. Opt-in: Gable never applies it
 * implicitly.
 */
export const renderScheduler: SchedulerLike = {
  now: () => asyncScheduler.now(),
  schedule<T>(work: (this: SchedulerAction<T>, state?: T) => void, delay = 0, state?: T): Subscription {
    if (delay > 0) return asyncScheduler.schedule(work, delay, state);
    const action = new Subscription() as Subscription & SchedulerAction<T>;
    let pending = state;
    const run = () => {
      if (!action.closed) work.call(action, pending);
    };
    action.schedule = (next, again = 0) => {
      pending = next;
      if (again > 0) {
        action.add(asyncScheduler.schedule(() => runAfterFlush(run), again));
      } else runAfterFlush(run);
      return action;
    };
    runAfterFlush(run);
    return action;
  },
};

/** An Observable of events with an `emit` method; the field factory for a component's outputs. */
export interface OutputEmitter<T> extends Observable<T> {
  emit(value: T): void;
}

/** Declares an output: `changed = output<number>()`. Completes when its owning scope is destroyed. */
export function output<T = void>(): OutputEmitter<T> {
  const subject = new Subject<T>();
  const emitter = subject.asObservable() as OutputEmitter<T>;
  emitter.emit = (value) => subject.next(value);
  currentScope()?.onDispose(() => subject.complete());
  return emitter;
}
