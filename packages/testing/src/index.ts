import { DEFER_BLOCKS, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import type { ComponentClass, Provider } from "@gable/core";
import { createTestInjector } from "./injector.js";
import type { Renderer } from "@gable/core/renderer";
import { createTestRenderer, createTestRoot, query, queryAll, serialize, textContent, type TestNode } from "./renderer.js";

export type { TestNode } from "./renderer.js";
export type { DeferHandle as DeferBlock, DeferState } from "@gable/core/internal";

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
  /** Resolves after the next scheduled flush has applied pending updates. */
  flush(): Promise<void>;
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  destroy(): void;
}

export function mount<T extends object>(Component: ComponentClass<T>, options: MountOptions = {}): Fixture<T> {
  const renderer = options.renderer ?? createTestRenderer();
  const container = createTestRoot();
  const defer: DeferHandle[] = [];
  const injector = createTestInjector([{ provide: DEFER_BLOCKS, useValue: defer }, ...(options.providers ?? [])]);
  const mounted: MountedComponent<T, TestNode> = instantiate(Component, { renderer, parent: container, injector });
  let destroyed = false;
  return {
    instance: mounted.instance,
    root: mounted.host,
    defer,
    query: (selector) => query(mounted.host, selector),
    queryAll: (selector) => queryAll(mounted.host, selector),
    text: () => textContent(mounted.host),
    html: () => (destroyed ? "" : serialize(mounted.host)),
    flush: () => whenFlushed(),
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
