import { Signal } from "signal-polyfill";
import { reportError } from "./errors.js";
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
  read.set = (value) => state.set(value);
  read.update = (fn) => state.set(fn(state.get()));
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

interface EffectNode {
  readonly scope: Scope;
  readonly seq: number;
  readonly computed: Signal.Computed<void>;
}

const nodes = new Map<Signal.Computed<void>, EffectNode>();
let seq = 0;
let scheduled: Promise<void> | null = null;

// One watcher for every effect. Its notify callback may not touch signals, so
// it only schedules the microtask flush.
const watcher = new Signal.subtle.Watcher(() => schedule());

function schedule(): void {
  scheduled ??= Promise.resolve().then(flushNow);
}

const afterFlush: Array<{ task: () => void; scope: Scope | null }> = [];
/** Queues work to run inside the next render flush, after its effects (schedules a flush if none is pending). */
export function runAfterFlush(task: () => void, scope: Scope | null = currentScope()): void {
  afterFlush.push({ task, scope });
  schedule();
}

function flushNow(): void {
  // Effects may write signals and so re-arm the watcher: loop until quiet.
  // Parents run before children; ties run in creation order.
  for (;;) {
    const pending = watcher
      .getPending()
      .map((c) => nodes.get(c as Signal.Computed<void>))
      .filter((n): n is EffectNode => n !== undefined)
      .sort((a, b) => a.scope.depth - b.scope.depth || a.seq - b.seq);
    watcher.watch(); // re-arm notifications
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
        node.computed.get();
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
  const computedNode = new Signal.Computed<void>(() => {
    // Effects see the scope they were created in (nested effects own children).
    runInScope(scope, fn);
  });
  nodes.set(computedNode, { scope, seq: seq++, computed: computedNode });
  scope.onDispose(() => {
    watcher.unwatch(computedNode);
    nodes.delete(computedNode);
  });
  try {
    computedNode.get(); // the initial run is synchronous
  } catch (error) {
    reportError(error, "effect", scope); // reported; the effect stays alive for its next dependency change
  }
  watcher.watch(computedNode);
}
