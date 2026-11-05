import { COMPONENT_OVERRIDES, DEFER_BLOCKS, flushSync, hasPendingFlush, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import { ErrorHandler, type ComponentClass, type ErrorContext, type ErrorSource, type LazyEntry, type Provider } from "@gable/core";
import { createTestInjector } from "./injector.js";
import type { Renderer } from "@gable/core/renderer";
import { createTestRenderer, createTestRoot, query, queryAll, serialize, textContent, type TestNode } from "./renderer.js";

export type { TestNode } from "./renderer.js";
export type { DeferHandle as DeferBlock, DeferState } from "@gable/core/internal";

/** One failure delivered to the ErrorHandler. */
export interface ErrorReport {
  error: unknown;
  context: ErrorContext;
}

export interface MountOptions {
  /** Defaults to the in-memory test renderer. */
  renderer?: Renderer<TestNode>;
  /** Providers for the root injector; override any Token. */
  providers?: Provider[];
  /**
   * `[[Child, Stub]]`: for this test only, replaces an imported component or a `lazy()` entry.
   * The stub must declare the selector of what it replaces (a lazy entry may be replaced by a component).
   */
  overrides?: ReadonlyArray<readonly [ComponentClass<any> | LazyEntry, ComponentClass<any> | LazyEntry]>;
  /**
   * Advances the runner fake clock by `ms` (what `advance` calls). Defaults to the `vi` or `jest`
   * global's `advanceTimersByTimeAsync` when present; gable owns no clock.
   */
  advanceTimers?: (ms: number) => void | Promise<void>;
}

/** Collected ErrorHandler reports. */
export interface ErrorExpectations {
  /** Returns and clears the collected reports (only those from `source` when given), so they no longer fail the test. */
  expect(source?: ErrorSource): ErrorReport[];
}

/** A mounted component under test. It never flushes on its own: call `flush()`. */
export interface Fixture<T extends object> {
  readonly instance: T;
  /** The host element node. */
  readonly root: TestNode;
  /** Every live `@defer` block, in creation order: drive each with `trigger()`, read its `state`, await `settle()`. */
  readonly defer: readonly DeferHandle[];
  query(selector: string): TestNode | null;
  queryAll(selector: string): TestNode[];
  /** Concatenated text of the host's subtree. */
  text(): string;
  /** Stable pretty-printed markup of the host's subtree (empty once destroyed). */
  html(): string;
  /**
   * Resolves after the next scheduled flush has applied pending updates. Rejects
   * with any error reported since the last flush that a test has not claimed
   * (the first error itself, or an AggregateError for several).
   */
  flush(): Promise<void>;
  /**
   * Flushes until nothing is scheduled (covering bound Promises and Observables that
   * resolve in microtasks), then rethrows unclaimed error reports like `flush()`.
   */
  settle(): Promise<void>;
  /** Runs pending effects now, then throws unclaimed error reports. */
  flushSync(): void;
  /** Advances the runner fake timers by `ms` (debounce, `validateAsync`, `@defer` timers), then settles. */
  advance(ms: number): Promise<void>;
  readonly errors: ErrorExpectations;
  /** Same as `errors.expect()`. */
  claimErrors(): ErrorReport[];
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  /** Destroys the component, then fails with any error reports the test never expected. Safe to call twice. */
  destroy(): void;
  [Symbol.dispose](): void;
}

const live = new Set<{ destroy(): void }>();
let hooked = false;
/** Registers auto-cleanup with the runner's `afterEach` when it is a global; otherwise tests call `destroy()` or use `using`. */
function hookCleanup(): void {
  if (hooked) return;
  const afterEach = (globalThis as { afterEach?: (fn: () => void) => void }).afterEach;
  if (typeof afterEach !== "function") return;
  hooked = true;
  afterEach(() => {
    const errors: unknown[] = [];
    for (const fixture of [...live]) {
      try {
        fixture.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} fixtures had unexpected error reports`);
  });
}

function defaultAdvance(ms: number): void | Promise<void> {
  const g = globalThis as Record<string, any>;
  const clock = g.vi ?? g.jest;
  const fn = clock?.advanceTimersByTimeAsync ?? clock?.advanceTimersByTime;
  if (!fn) throw new Error("advance(ms) needs fake timers: pass mount(..., { advanceTimers }) or expose your runner's `vi`/`jest` global.");
  return fn.call(clock, ms);
}

const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

export function mount<T extends object>(Component: ComponentClass<T>, options: MountOptions = {}): Fixture<T> {
  const renderer = options.renderer ?? createTestRenderer();
  const container = createTestRoot();
  const reports: Array<ErrorReport & { surfaced: boolean }> = [];
  class Collector extends ErrorHandler {
    override handleError(error: unknown, context: ErrorContext): void {
      reports.push({ error, context, surfaced: false });
    }
  }
  const defer: DeferHandle[] = [];
  hookCleanup();
  const injector = createTestInjector([{ provide: DEFER_BLOCKS, useValue: defer }, { provide: ErrorHandler, useClass: Collector }, { provide: COMPONENT_OVERRIDES, useValue: new Map(options.overrides ?? []) }, ...(options.providers ?? [])]);
  const mounted: MountedComponent<T, TestNode> = instantiate(Component, { renderer, parent: container, injector });
  let destroyed = false;
  const unclaimed = () => {
    const fresh = reports.filter((r) => !r.surfaced);
    for (const r of fresh) r.surfaced = true;
    if (fresh.length === 1) throw fresh[0]!.error;
    if (fresh.length > 1) throw new AggregateError(fresh.map((r) => r.error), `${fresh.length} unclaimed errors were reported`);
  };
  const expectErrors = (source?: ErrorSource): ErrorReport[] => {
    const taken: ErrorReport[] = [];
    for (let i = 0; i < reports.length; ) {
      const { error, context } = reports[i]!;
      if (source === undefined || context.source === source) {
        taken.push({ error, context });
        reports.splice(i, 1);
      } else i++;
    }
    return taken;
  };
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      await tick();
      if (!hasPendingFlush()) break;
      await whenFlushed();
    }
    unclaimed();
  };
  const fixture: Fixture<T> = {
    instance: mounted.instance,
    root: mounted.host,
    defer,
    query: (selector) => query(mounted.host, selector),
    queryAll: (selector) => queryAll(mounted.host, selector),
    text: () => textContent(mounted.host),
    html: () => (destroyed ? "" : serialize(mounted.host)),
    flush: async () => {
      await whenFlushed();
      unclaimed();
    },
    settle,
    flushSync: () => {
      flushSync();
      unclaimed();
    },
    advance: async (ms) => {
      await (options.advanceTimers ?? defaultAdvance)(ms);
      await settle();
    },
    errors: { expect: expectErrors },
    claimErrors: () => expectErrors(),
    dispatch: (target, name, event) => {
      for (const handler of [...(target.listeners[name] ?? [])]) handler(event);
    },
    destroy() {
      if (!destroyed) {
        destroyed = true;
        live.delete(fixture);
        mounted.destroy();
      }
      const left = reports.splice(0);
      if (left.length === 1) throw left[0]!.error;
      if (left.length > 1) throw new AggregateError(left.map((r) => r.error), `${left.length} error reports were never expected (use errors.expect())`);
    },
    [Symbol.dispose]() {
      fixture.destroy();
    },
  };
  live.add(fixture);
  return fixture;
}
export { createTestInjector } from "./injector.js";
