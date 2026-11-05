import { DEFER_BLOCKS, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import { ErrorHandler, type ComponentClass, type ErrorContext, type Provider } from "@gable/core";
import { createTestInjector, httpTesting } from "./injector.js";
import { HttpBackend } from "@gable/core/http";
import { HttpTestingBackend } from "./http.js";
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
  /** Takes the collected error reports, so the test expects them and flush no longer fails on them. */
  claimErrors(): ErrorReport[];
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  /** Tears the fixture down; throws if an HTTP request is still unmatched. */
  destroy(): void;
}

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
  const mounted: MountedComponent<T, TestNode> = instantiate(Component, { renderer, parent: container, injector });
  let destroyed = false;
  return {
    instance: mounted.instance,
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
      const fresh = reports.filter((r) => !r.surfaced);
      for (const r of fresh) r.surfaced = true;
      if (fresh.length === 1) throw fresh[0]!.error;
      if (fresh.length > 1) throw new AggregateError(fresh.map((r) => r.error), `${fresh.length} unclaimed errors were reported`);
    },
    claimErrors: () => reports.splice(0).map(({ error, context }) => ({ error, context })),
    dispatch: (target, name, event) => {
      for (const handler of [...(target.listeners[name] ?? [])]) handler(event);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        const backend = injector.get(HttpBackend, { optional: true });
        if (backend instanceof HttpTestingBackend) backend.verify();
      } finally {
        mounted.destroy();
      }
    },
  };
}
export { createTestInjector } from "./injector.js";
export { HttpTestingBackend, TestRequest } from "./http.js";
export type { RequestMatch } from "./http.js";
export { httpTesting } from "./injector.js";
