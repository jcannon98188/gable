import { COMPONENT_OVERRIDES, DEFER_BLOCKS, flushSync, hasPendingFlush, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import { ErrorHandler, type ComponentClass, type ErrorContext, type ErrorSource, type LazyEntry, type Provider } from "@gable/core";
import { applyUpdate, type HotResult } from "@gable/core/hmr";
import { createTestInjector, httpTesting } from "./injector.js";
import { HttpBackend } from "@gable/core/http";
import { HttpTestingBackend } from "./http.js";
import type { Renderer } from "@gable/core/renderer";
import { createTestRenderer, createTestRoot, query, queryAll, serialize, textContent, type TestNode } from "./renderer.js";

export type { TestNode } from "./renderer.js";
export type { DeferHandle as DeferBlock, DeferState } from "@gable/core/internal";
export type { HotResult } from "@gable/core/hmr";

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
  /** The recording HttpBackend: `expectOne`, `expectNone`, `match`, `verify`. `destroy()` verifies it. */
  readonly http: HttpTestingBackend;
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
  /**
   * Replays a hot update through the real HMR path (dev only). Each argument is a new version of a class (matched
   * to the live class of the same name), a module namespace object (`{ Counter, hmr: 'reset' }`), or an `Error`
   * standing for a module that failed to evaluate. All arguments form one transaction.
   */
  hotReplace(...updates: Array<Function | Record<string, unknown> | Error>): HotResult;
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  /**
   * Edits a form control as a user would: a string types text or chooses an option, a boolean checks or unchecks
   * (a radio is chosen with `true`). Sets the control's property, then fires its `input` or `change` event.
   */
  fill(target: TestNode, value: string | boolean): void;
  /** The control loses focus (a `[field]` marks its field touched). */
  blur(target: TestNode): void;
  /** Destroys the component, then fails with any unmatched HTTP request or error report the test never expected. Safe to call twice. */
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
let fixtures = 0;

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
  const mounted = instantiate(Component, { renderer, parent: container, injector });
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
  const moduleUrl = `gable-test://fixture-${++fixtures}`;
  const fixture: Fixture<T> = {
    get instance() {
      return mounted.instance;
    },
    root: mounted.host,
    defer,
    get http() {
      return httpTesting(injector);
    },
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
    hotReplace(...updates) {
      const exports: Record<string, unknown> = {};
      const failures: unknown[] = [];
      for (const u of updates) {
        if (u instanceof Error) failures.push(u);
        else if (typeof u === "function") exports[u.name] = u;
        else Object.assign(exports, u);
      }
      return applyUpdate([{ url: moduleUrl, exports }], failures, [mounted.scope, injector]);
    },
    dispatch: (target, name, event) => {
      for (const handler of [...(target.listeners[name] ?? [])]) handler(event);
    },
    fill: (target, value) => {
      const type = String(target.attrs.type ?? target.props.type ?? "text");
      const toggles = target.tag === "input" && (type === "checkbox" || type === "radio");
      if (typeof value === "boolean") target.props.checked = value;
      else target.props.value = value;
      fixture.dispatch(target, toggles || target.tag === "select" ? "change" : "input");
    },
    blur: (target) => fixture.dispatch(target, "blur"),
    destroy() {
      if (!destroyed) {
        destroyed = true;
        live.delete(fixture);
        try {
          const backend = injector.get(HttpBackend, { optional: true });
          if (backend instanceof HttpTestingBackend) backend.verify();
        } finally {
          mounted.destroy();
        }
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
export { HttpTestingBackend, TestRequest } from "./http.js";
export type { RequestMatch } from "./http.js";
export { httpTesting } from "./injector.js";
