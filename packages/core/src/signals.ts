import { Signal } from "signal-polyfill";
import { reportError } from "./errors.js";
import { inReadPhase, readPhase } from "./read-phase.js";
import { currentScope, createScope, runInScope, type Scope } from "./scope.js";

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

export interface SignalOptions<T> {
  /** Equality used to skip writes that change nothing. Defaults to `Object.is`. */
  equal?: (a: T, b: T) => boolean;
}

export function signal<T>(initial: T, options?: SignalOptions<T>): WritableSignal<T> {
  const state = new Signal.State<T>(initial, options?.equal ? { equals: options.equal } : undefined);
  const read = (() => state.get()) as WritableSignal<T>;
  read.set = (value) => (writes++, state.set(value));
  read.update = (fn) => (writes++, state.set(fn(state.get())));
  return read;
}

export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  const c = new Signal.Computed<T>(fn, options?.equal ? { equals: options.equal } : undefined);
  return () => c.get();
}

/** Reads signals without subscribing the running effect or computed to them. */
export function untracked<T>(fn: () => T): T {
  return Signal.subtle.untrack(fn);
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
/** Counts signal writes, so effect() can tell whether its first run wrote to a signal. */
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
      try {
        node.get();
      } catch (error) {
        reportError(error, "effect", node.scope);
      }
    }
  }
  scheduled = null;
}

/** Resolves once the pending flush (if any) has completed. */
export function whenFlushed(): Promise<void> {
  return scheduled ?? Promise.resolve();
}

/** Whether a flush is scheduled but has not yet run. */
export function hasPendingFlush(): boolean {
  return scheduled !== null;
}

/** Runs any pending effects synchronously. */
export function flushSync(): void {
  if (scheduled) flushNow();
}

/**
 * Runs `fn` now and again whenever a signal it read changes. Re-runs are
 * batched into one microtask flush. The effect is owned by the current scope
 * and stops when that scope is disposed.
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
  scope.onDispose(() => {
    bucket.watcher.unwatch(node);
    if (bucket.size-- === BUCKET_SIZE) openBuckets.push(bucket);
  });
  const before = writes;
  try {
    node.get(); // the initial run is synchronous
  } catch (error) {
    reportError(error, "effect", scope); // reported; the effect stays alive for its next dependency change
  }
  bucket.watcher.watch(node);
  if (writes !== before && !bucket.queued) {
    // The first run wrote a signal it had read; watch() does not notify for an already-dirty node, so look at this bucket on the next flush.
    bucket.queued = true;
    dirtyBuckets.push(bucket);
  }
}
