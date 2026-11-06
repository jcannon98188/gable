// `@gable/core/rxjs`: the RxJS side of Gable. This is the only entry that
// imports RxJS (a peer dependency); the signal core and templates never do.
import { Observable, Subscription, type Subscriber, asyncScheduler, type SchedulerAction, type SchedulerLike } from "rxjs";
import { effect, runAfterFlush, untracked, type ReadonlySignal } from "./signals.js";
import { createScope, currentScope, runInScope, type Scope } from "./scope.js";

export { toSignal } from "./bridge.js";
export type { ToSignalOptions } from "./bridge.js";

/**
 * Observes a signal, flush-aligned: emits the current value on subscribe, then
 * the settled value after each coalesced flush. Intermediate writes are not seen.
 */
export function toObservable<T>(source: ReadonlySignal<T>): Observable<T> {
  const owner = currentScope();
  // All live subscribers share one effect (and scope), created by the first
  // subscriber and disposed with the last. Each keeps its own last-seen value.
  interface Entry {
    subscriber: Subscriber<T>;
    first: boolean;
    last: T | undefined;
  }
  const entries = new Set<Entry>();
  let scope: Scope | null = null;

  const deliver = (entry: Entry, value: T) => {
    if (entry.first || !Object.is(value, entry.last)) entry.subscriber.next(value);
    entry.first = false;
    entry.last = value;
  };

  return new Observable<T>((subscriber) => {
    const entry: Entry = { subscriber, first: true, last: undefined };
    entries.add(entry);
    if (scope) {
      // Joining a running effect: emit the current value now; the effect covers later changes.
      let value: T;
      try {
        value = untracked(source);
      } catch (error) {
        subscriber.error(error);
        return () => void entries.delete(entry);
      }
      deliver(entry, value);
    } else {
      const own = (scope = createScope(owner));
      runInScope(own, () =>
        effect(() => {
          let value: T;
          try {
            value = source();
          } catch (error) {
            for (const e of [...entries]) e.subscriber.error(error);
            return;
          }
          for (const e of [...entries]) if (entries.has(e)) deliver(e, value);
        }),
      );
    }
    return () => {
      entries.delete(entry);
      if (entries.size === 0 && scope) {
        const done = scope;
        scope = null;
        done.dispose();
      }
    };
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

export { output, OutputEmitter } from "./output.js";
