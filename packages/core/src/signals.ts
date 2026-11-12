import { Signal } from "signal-polyfill";
import { reportError } from "./errors.js";
import { inReadPhase, readPhase } from "./read-phase.js";
import { currentScope, createScope, runInScope, type Scope } from "./scope.js";
import { DEV, devtools } from "./dev-hooks.js";

// The TC39 polyfill is an implementation detail: it is imported only here and
// never appears in a public type.

/** A readable reactive value; read it by calling it. */
export interface ReadonlySignal<T> {
  (): T;
}

/** A signal that can be written. */
export interface WritableSignal<T> extends ReadonlySignal<T> {
  set(value: T): void;
  update(fn: (current: T) => T): void;
}

/** Options shared by {@link signal} and {@link computed}. */
export interface SignalOptions<T> {
  /** Equality used to skip writes that change nothing. Defaults to `Object.is`. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Creates a writable signal holding `initial`. Read it by calling it; write it with `set` or `update`. Reading inside an
 * {@link effect} or a {@link computed} subscribes that effect or computed to the signal.
 *
 * @remarks
 * A write whose new value is equal to the current one (by `options.equal`, `Object.is` by default) changes nothing and
 * notifies nobody. Objects and arrays are compared by identity, so replace them rather than mutating them in place.
 *
 * @typeParam T - The type of the held value.
 * @param initial - The starting value.
 * @param options - Optional settings, such as a custom `equal`.
 * @returns A {@link WritableSignal}: call it to read, `set(value)` to replace, `update(fn)` to derive the next value from the current one.
 *
 * @example
 * ```ts
 * export class Counter {
 *   static meta = {
 *     selector: "app-counter",
 *     template: html`<button (click)="increment()">{{ count() }}</button>`,
 *   };
 *
 *   count = signal(0);
 *
 *   increment() {
 *     this.count.update((n) => n + 1);
 *   }
 * }
 * ```
 */
export function signal<T>(initial: T, options?: SignalOptions<T>): WritableSignal<T> {
  const state = new Signal.State<T>(initial, options?.equal ? { equals: options.equal } : undefined);
  const read = (() => state.get()) as WritableSignal<T>;
  read.set = (value) => (DEV && willWrite(state), firstRuns > 0 && writes++, state.set(value));
  read.update = (fn) => (DEV && willWrite(state), firstRuns > 0 && writes++, state.set(fn(state.get())));
  if (DEV) devtools.current?.signal(read, state, "state", currentScope());
  return read;
}

/** Dev only: the devtools record state history, so they see the value a write replaces. */
function willWrite(node: object): void {
  const sink = devtools.current;
  if (!sink) return;
  if (sink.recording) sink.write!(node);
  if (sink.timing) sink.touch?.(node);
}

/**
 * A read-only signal plus the function that feeds it (what toSignal needs). It
 * reads straight through to the state, one call layer shallower than wrapping a
 * writable signal in a read-only closure; that layer is paid on every read, and
 * toSignal-fan-in reads 1,000 of these per run.
 */
export function stateSource<T>(initial: T): { read: ReadonlySignal<T>; write: (value: T) => void } {
  const state = new Signal.State<T>(initial);
  if (DEV && devtools.current) {
    const read = () => state.get();
    devtools.current.signal(read, state, "state", currentScope());
    return { read, write: (value) => (willWrite(state), firstRuns > 0 && writes++, state.set(value)) };
  }
  return { read: () => state.get(), write: (value) => (firstRuns > 0 && writes++, state.set(value)) };
}

/**
 * Creates a read-only signal derived from other signals. `fn` runs lazily, on the first read and again on a read after one
 * of the signals it read has changed; the result is cached until then.
 *
 * @remarks
 * Dependencies are discovered on each run, so only the signals `fn` actually reads are tracked. When the new result is
 * equal to the old one (by `options.equal`, `Object.is` by default) the signals and effects that read the computed are not
 * notified. `fn` should be pure: do not write signals inside it.
 *
 * @typeParam T - The type of the derived value.
 * @param fn - Computes the value from other signals.
 * @param options - Optional settings, such as a custom `equal`.
 * @returns A {@link ReadonlySignal}: call it to read the current value.
 *
 * @example
 * ```ts
 * export class Cart {
 *   static meta = {
 *     selector: "app-cart",
 *     template: html`<p>{{ count() }} items, total {{ total() }}</p>`,
 *   };
 *
 *   prices = signal([5, 10]);
 *   count = computed(() => this.prices().length);
 *   total = computed(() => this.prices().reduce((sum, p) => sum + p, 0));
 * }
 * ```
 */
export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const c = new Signal.Computed<T>(fn, options?.equal ? { equals: options.equal } : undefined);
  const read = () => c.get();
  if (DEV) devtools.current?.signal(read, c, "computed", currentScope());
  return read;
}

/**
 * Reads signals without subscribing the running effect or computed to them.
 *
 * @typeParam T - What `fn` returns.
 * @param fn - Runs immediately; the signals it reads are not tracked.
 * @returns Whatever `fn` returns.
 *
 * @example
 * ```ts
 * export class Tracker {
 *   static meta = { selector: "app-tracker", template: html`<p>{{ query() }}</p>` };
 *
 *   query = signal("");
 *   clicks = signal(0);
 *
 *   // Field initialisers run in the component's scope. Re-runs when `query`
 *   // changes, but not when `clicks` does.
 *   log = effect(() => console.log(this.query(), untracked(() => this.clicks())));
 * }
 * ```
 */
export function untracked<T>(fn: () => T): T {
  return Signal.subtle.untrack(fn);
}

// --- devtools support (dev only; unused, so dropped, in production builds) ---

/** Dependency edges and writability of a signal node, for the devtools. */
export function inspectNode(node: object): { sources: object[]; sinks: object[]; state: boolean } {
  const n = node as Signal.State<unknown> | Signal.Computed<unknown>;
  const state = n instanceof Signal.State;
  return {
    sources: state ? [] : Signal.subtle.introspectSources(n as Signal.Computed<unknown>),
    sinks: Signal.subtle.introspectSinks(n),
    state,
  };
}

/** Reads a node without subscribing anything to it. */
export function peekNode(node: object): unknown {
  return Signal.subtle.untrack(() => (node as Signal.State<unknown>).get());
}

/** Writes a state node directly (devtools editing). */
export function pokeNode(node: object, value: unknown): void {
  (node as Signal.State<unknown>).set(value);
}

// --- scheduler -------------------------------------------------------------

// Effects are watched in buckets of up to BUCKET_SIZE, each with its own
// watcher. A watcher's notify callback says which bucket went dirty, so a flush
// scans only the dirty buckets (via getPending) rather than every watched
// effect. The notify callback may not touch signals, so it only records the
// bucket and schedules the microtask flush.
const BUCKET_SIZE = 32;

interface Bucket {
  readonly watcher: Signal.subtle.Watcher;
  size: number;
  queued: boolean;
}

class EffectNode extends Signal.Computed<void> {
  constructor(
    fn: () => void,
    readonly scope: Scope,
    readonly seq: number,
    readonly bucket: Bucket,
  ) {
    super(fn);
  }
}

let seq = 0;
let scheduled: Promise<void> | null = null;
/** Buckets that may hold a pending effect. */
let dirtyBuckets: Bucket[] = [];
/** Buckets with room for another effect. */
const openBuckets: Bucket[] = [];
/** Effects whose synchronous first run is in progress. Writes are only counted while this is above zero, which keeps the hot write path to a load and a branch. */
let firstRuns = 0;
/** Counts signal writes made during first runs, so effect() can tell whether its first run wrote to a signal. */
let writes = 0;

function newBucket(): Bucket {
  const bucket: Bucket = {
    size: 0,
    queued: false,
    watcher: new Signal.subtle.Watcher(() => {
      if (!bucket.queued) {
        bucket.queued = true;
        dirtyBuckets.push(bucket);
      }
      schedule();
    }),
  };
  return bucket;
}

function schedule(): void {
  scheduled ??= Promise.resolve().then(flushNow);
}

const afterFlush: Array<{ task: () => void; scope: Scope | null }> = [];
/** Queues work to run inside the next render flush, after its effects (schedules a flush if none is pending). */
export function runAfterFlush(task: () => void, scope: Scope | null = currentScope()): void {
  afterFlush.push({ task, scope });
  schedule();
}

/** Most rounds one flush runs before it concludes that effects keep re-arming each other. */
const MAX_FLUSH_ROUNDS = 1000;

function byDepthThenCreation(a: EffectNode, b: EffectNode): number {
  return a.scope.depth - b.scope.depth || a.seq - b.seq;
}

function flushNow(): void {
  const dev = DEV ? devtools.current : null;
  const t0 = dev?.timing ? performance.now() : 0;
  let ran = 0;
  // Effects may write signals and so re-arm a watcher: loop until quiet.
  // Parents run before children; ties run in creation order.
  let rounds = 0;
  for (;;) {
    let pending: EffectNode[] = [];
    if (dirtyBuckets.length > 0) {
      const buckets = dirtyBuckets;
      dirtyBuckets = [];
      for (const bucket of buckets) {
        bucket.queued = false;
        for (const c of bucket.watcher.getPending()) pending.push(c as EffectNode);
        bucket.watcher.watch(); // re-arm notifications
      }
      if (pending.length > 1) pending.sort(byDepthThenCreation);
    }
    if (pending.length > 0 && ++rounds > MAX_FLUSH_ROUNDS) {
      reportError(new Error(`Effects did not settle after ${MAX_FLUSH_ROUNDS} rounds: an effect loop keeps writing signals the others read.`), "effect", pending[0]!.scope);
      break;
    }
    if (pending.length === 0) {
      const next = afterFlush.shift();
      if (!next) break;
      try {
        next.task();
      } catch (error) {
        reportError(error, "subscription", next.scope);
      }
      continue;
    }
    for (const node of pending) {
      if (node.scope.disposed) continue;
      const t = dev?.timing ? performance.now() : 0;
      if (dev?.timing) dev.beforeRun?.(node);
      try {
        node.get();
      } catch (error) {
        reportError(error, "effect", node.scope);
      }
      if (dev?.timing) (ran++, dev.effectRun(node, performance.now() - t, false));
    }
  }
  scheduled = null;
  if (dev?.timing) dev.flushed(t0, ran, rounds);
}

/** Resolves once the pending flush (if any) has completed. */
export function whenFlushed(): Promise<void> {
  return scheduled ?? Promise.resolve();
}

/** Whether a flush is scheduled but has not yet run. */
export function hasPendingFlush(): boolean {
  return scheduled !== null;
}

/**
 * Runs any pending effects synchronously, instead of waiting for the microtask flush. A frame loop calls this after its
 * own writes and before it renders, so a frame's bindings are applied in that frame.
 */
export function flushSync(): void {
  if (scheduled) flushNow();
}

/**
 * Runs `fn` now and again whenever a signal it read changes. Re-runs are
 * batched into one microtask flush. The effect is owned by the current scope
 * and stops when that scope is disposed.
 *
 * @param fn - The side effect. Signals it reads become its dependencies; an error it throws is reported and the effect stays alive.
 *
 * @example
 * ```ts
 * export class Title {
 *   static meta = { selector: "app-title", template: html`<h1>{{ name() }}</h1>` };
 *
 *   name = signal("Gable");
 *
 *   // Field initialisers run in the component's scope, so the effect stops
 *   // with the component.
 *   sync = effect(() => {
 *     document.title = this.name();
 *   });
 * }
 * ```
 */
export function effect(fn: () => void): void {
  const scope = currentScope() ?? createScope(null);
  const bucket = openBuckets.length > 0 ? openBuckets[openBuckets.length - 1]! : newBucket();
  if (bucket.size === 0 || bucket.size === BUCKET_SIZE - 1) {
    // fresh bucket becomes open; a bucket that just filled stops being open
    if (bucket.size === 0 && openBuckets[openBuckets.length - 1] !== bucket) openBuckets.push(bucket);
    if (bucket.size === BUCKET_SIZE - 1) openBuckets.pop();
  }
  bucket.size++;
  const node = new EffectNode(
    () => {
      // Effects see the scope they were created in (nested effects own children).
      runInScope(scope, () => (readPhase() ? fn() : inReadPhase("effect", fn)));
    },
    scope,
    seq++,
    bucket,
  );
  if (DEV) devtools.current?.effect(node, scope);
  scope.onDispose(() => {
    bucket.watcher.unwatch(node);
    if (bucket.size-- === BUCKET_SIZE) openBuckets.push(bucket);
  });
  const before = writes;
  const dev = DEV ? devtools.current : null;
  const t0 = dev?.timing ? performance.now() : 0;
  firstRuns++;
  try {
    node.get(); // the initial run is synchronous
  } catch (error) {
    reportError(error, "effect", scope); // reported; the effect stays alive for its next dependency change
  } finally {
    firstRuns--;
  }
  if (dev?.timing) dev.effectRun(node, performance.now() - t0, true);
  bucket.watcher.watch(node);
  if (writes !== before && !bucket.queued) {
    // The first run wrote a signal it had read; watch() does not notify for an already-dirty node, so look at this bucket on the next flush.
    bucket.queued = true;
    dirtyBuckets.push(bucket);
    schedule();
  }
}
