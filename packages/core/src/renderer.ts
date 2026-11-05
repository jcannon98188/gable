import type { Provider } from "./di.js";

export { Location, History, Title } from "./platform.js";

/**
 * The Renderer contract: a small set of synchronous operations over opaque
 * node handles. The core owns templates, bindings, control flow and
 * scheduling; a renderer owns nodes, and the meaning of tags and properties.
 */
export interface Renderer<N = unknown> {
  /** Shown in errors, e.g. an unknown `@defer` trigger. */
  readonly name?: string;
  /** The `@defer` triggers `observeTrigger` understands; any other name is a dev-time error naming this renderer. */
  readonly triggers?: readonly string[];
  /** Platform services (Location, History, Title, ...) this renderer ships; `bootstrap` adds them to the root injector, before the app's own providers. */
  readonly providers?: readonly Provider[];
  // Create. `parent` is context only (e.g. SVG/MathML namespace); it does not insert.
  createElement(tag: string, parent: N | null): N;
  createText(text: string): N;
  createAnchor(): N;

  // Update.
  setProperty(node: N, name: string, value: unknown): void;
  setAttribute(node: N, name: string, value: string | null): void;
  setClass(node: N, name: string, on: boolean): void;
  setStyle(node: N, name: string, value: string | null): void;
  setText(node: N, text: string): void;

  // Tree.
  insert(parent: N, node: N, before?: N | null): void;
  remove(node: N): void;

  // Events. Returns an unsubscribe function.
  listen(node: N, name: string, handler: (event: unknown) => void): () => void;

  /** Registers CSS; returns the scoping token to stamp on elements (empty when `scoped` is false). Re-registering an id replaces the CSS. */
  registerStyles?(componentId: string, css: string, options?: { scoped?: boolean }): string;
  /** Resolves the opaque `target` given to `bootstrap` (DOM: a selector or element) to the node the root adopts as its host. */
  resolveTarget?(target: unknown): N;
  /** Renderer-specific `@defer` triggers; returns a dispose function. */
  observeTrigger?(name: string, args: unknown[], placeholder: N | undefined, fire: () => void): () => void;
  /** Optional DOM-state preservation around a view rebuild (HMR). */
  captureViewState?(rootNodes: N[]): unknown;
  restoreViewState?(newRootNodes: N[], token: unknown): void;
}
