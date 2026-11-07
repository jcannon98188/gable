// Signal <-> stream machinery shared by toSignal and direct template binding.
// It is structurally typed against Observable/Promise and never imports RxJS,
// so signals and templates stay RxJS-free (RxJS is only a peer dependency of
// the `@gable/core/rxjs` entry).
import { stateSource, type ReadonlySignal } from "./signals.js";
import { reportError } from "./errors.js";
import { currentScope, type Scope } from "./scope.js";

export interface Unsubscribable {
  unsubscribe(): void;
}

/**
 * The slice of an RxJS Observable the bridge needs. It is typed with the plain
 * callback form so that T is inferred from an Observable's own (overloaded)
 * `subscribe`; the runtime passes an observer object, see `connect`.
 */
export interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

interface ObserverSubscribable<T> {
  subscribe(observer: { next: (value: T) => void; error: (error: unknown) => void; complete: () => void }): Unsubscribable;
}

export type StreamSource<T> = Subscribable<T> | PromiseLike<T>;

/** True for Observable-like and Promise-like objects, which templates bind directly. */
export function isStream(value: unknown): value is StreamSource<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { subscribe?: unknown; then?: unknown };
  return typeof v.subscribe === "function" || typeof v.then === "function";
}

/**
 * Feeds every emission of `source` to `next`. Errors go to the ErrorHandler as `subscription`, attributed to `scope`.
 * Promises are single-emission Observables. Returns an idempotent teardown.
 */
export function connect<T>(source: StreamSource<T>, next: (value: T) => void, scope: Scope | null = currentScope()): () => void {
  let closed = false;
  if (typeof (source as Subscribable<T>).subscribe === "function") {
    const sub = (source as unknown as ObserverSubscribable<T>).subscribe({
      next: (value) => !closed && next(value),
      error: (error) => !closed && reportError(error, "subscription", scope),
      complete: () => {},
    });
    return () => {
      closed = true;
      sub.unsubscribe();
    };
  }
  (source as PromiseLike<T>).then(
    (value) => !closed && next(value),
    (error) => !closed && reportError(error, "subscription", scope),
  );
  return () => {
    closed = true;
  };
}

/**
 * Options for {@link toSignal}.
 *
 * @typeParam T - The source's value type.
 */
export interface ToSignalOptions<T> {
  /** The value before the first emission; narrows the result from `T | undefined` to `T`. */
  initialValue?: T;
  /** Own the subscription with this scope instead of the current one. */
  scope?: Scope;
  /** Opt out of scope ownership; the subscription then lives as long as the source. */
  manual?: boolean;
}

/**
 * Subscribes to an Observable or Promise and exposes its latest value as a read-only signal.
 *
 * @example
 * ```ts
 * import { interval } from "rxjs";
 *
 * export class Clock {
 *   static meta = {
 *     selector: "app-clock",
 *     template: html`<p>{{ ticks() }}</p>`,
 *   };
 *
 *   ticks = toSignal(interval(1000), { initialValue: 0 });
 * }
 * ```
 */
export function toSignal<T>(source: StreamSource<T>, options: ToSignalOptions<T> & { initialValue: T }): ReadonlySignal<T>;
export function toSignal<T>(source: StreamSource<T>, options?: ToSignalOptions<T>): ReadonlySignal<T | undefined>;
export function toSignal<T>(source: StreamSource<T>, options: ToSignalOptions<T> = {}): ReadonlySignal<T | undefined> {
  const owner = options.manual ? null : (options.scope ?? currentScope());
  if (!owner && !options.manual) {
    throw new Error("toSignal() must be called during setup (a component or service field initialiser). Pass { scope } or { manual: true } to call it elsewhere.");
  }
  const { read, write } = stateSource<T | undefined>(options.initialValue);
  const stop = connect(source, write, owner);
  owner?.onDispose(stop);
  return read;
}
