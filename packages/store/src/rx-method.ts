import { isObservable, Subject, Subscription, type Observable } from "rxjs";
import { toObservable } from "@gable/core/rxjs";
import type { ReadonlySignal } from "@gable/core";
import { createScope, currentScope, reportError, runInScope, type Scope } from "@gable/core/internal";

export interface RxMethodOptions {
  /** Own the pipeline with this scope instead of the current one. */
  scope?: Scope;
}

/** What an `rxMethod` accepts: a plain value, a signal (tracked) or an Observable. */
export type RxMethodInput<T> = T | ReadonlySignal<T> | Observable<T>;

/** The function `rxMethod` returns. It also has `destroy()`, which stops the whole pipeline. */
export interface RxMethod<T> {
  (input: RxMethodInput<T>): Subscription;
  destroy(): void;
}

/**
 * NgRx-style reactive method. `operator` receives a stream of every value fed to the method and
 * returns the effect pipeline (`debounceTime`, `switchMap`, `tap`, ...). Call the result with
 * a value (one emission), a signal (re-emits on each change, flush-aligned) or an Observable
 * (forwards every emission). Each call returns a Subscription that stops just that input.
 *
 * The pipeline lives in the scope current at creation (a store's or component's setup), or
 * `options.scope`, and is torn down with it. Errors that reach the end of the pipeline go to the
 * ErrorHandler as `subscription` and end the pipeline; catch inside the inner observable
 * (`switchMap((q) => load(q).pipe(catchError(...)))`) to keep it alive.
 */
export function rxMethod<T>(operator: (source: Observable<T>) => Observable<unknown>, options: RxMethodOptions = {}): RxMethod<T> {
  const owner = options.scope ?? currentScope();
  if (!owner) {
    throw new Error("rxMethod() must be called during setup (a store feature, component or service). Pass { scope } to call it elsewhere.");
  }
  const input = new Subject<T>();
  const pipeline = operator(input.asObservable()).subscribe({
    error: (error) => reportError(error, "subscription", owner),
  });
  const inputs = new Subscription();
  const destroy = () => {
    inputs.unsubscribe();
    input.complete();
    pipeline.unsubscribe();
  };
  owner.onDispose(destroy);

  const track = (sub: Subscription) => (inputs.add(sub), sub);
  const method = (value: RxMethodInput<T>): Subscription => {
    if (owner.disposed) return Subscription.EMPTY;
    if (isObservable(value)) return track(value.subscribe({ next: (v) => input.next(v), error: (e) => reportError(e, "subscription", owner) }));
    if (typeof value === "function") {
      // A signal: observe it inside a child scope so the effect dies with this input or the owner.
      const child = createScope(owner);
      const sub = runInScope(child, () => toObservable(value as ReadonlySignal<T>)).subscribe({
        next: (v) => input.next(v),
        error: (e) => reportError(e, "subscription", owner),
      });
      sub.add(() => child.dispose());
      return track(sub);
    }
    input.next(value as T);
    return Subscription.EMPTY;
  };
  return Object.assign(method, { destroy });
}
