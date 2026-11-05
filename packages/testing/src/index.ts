import { DEFER_BLOCKS, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import { ErrorHandler, type ComponentClass, type ErrorContext, type Provider } from "@gable/core";
import { createTestInjector } from "./injector.js";
import { applyUpdate, type HotResult } from "@gable/core/hmr";
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
  /** Takes the collected error reports, so the test expects them and flush no longer fails on them. */
  claimErrors(): ErrorReport[];
  /**
   * Replays a hot update through the real HMR path (dev only). Each argument is a new version of a class (matched
   * to the live class of the same name), a module namespace object (`{ Counter, hmr: 'reset' }`), or an `Error`
   * standing for a module that failed to evaluate. All arguments form one transaction.
   */
  hotReplace(...updates: Array<Function | Record<string, unknown> | Error>): HotResult;
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  destroy(): void;
}

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
  const injector = createTestInjector([{ provide: DEFER_BLOCKS, useValue: defer }, { provide: ErrorHandler, useClass: Collector }, ...(options.providers ?? [])]);
  const mounted = instantiate(Component, { renderer, parent: container, injector });
  let destroyed = false;
  const moduleUrl = `gable-test://fixture-${++fixtures}`;
  return {
    get instance() {
      return mounted.instance;
    },
    root: mounted.host,
    defer,
    query: (selector) => query(mounted.host, selector),
    queryAll: (selector) => queryAll(mounted.host, selector),
    text: () => textContent(mounted.host),
    html: () => (destroyed ? "" : serialize(mounted.host)),
    flush: async () => {
      await whenFlushed();
      const fresh = reports.filter((r) => !r.surfaced);
      for (const r of fresh) r.surfaced = true;
      if (fresh.length === 1) throw fresh[0]!.error;
      if (fresh.length > 1) throw new AggregateError(fresh.map((r) => r.error), `${fresh.length} unclaimed errors were reported`);
    },
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
    claimErrors: () => reports.splice(0).map(({ error, context }) => ({ error, context })),
    dispatch: (target, name, event) => {
      for (const handler of [...(target.listeners[name] ?? [])]) handler(event);
    },
    destroy() {
      destroyed = true;
      mounted.destroy();
    },
  };
}
export { createTestInjector } from "./injector.js";
