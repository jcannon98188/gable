/**
 * The Renderer contract: a small set of synchronous operations over opaque
 * node handles. The core owns templates, bindings, control flow and
 * scheduling; a renderer owns nodes, and the meaning of tags and properties.
 */
export interface Renderer<N = unknown> {
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

  /** Registers scoped CSS; returns the scoping token stamped on elements. Re-registering an id replaces the CSS. */
  registerStyles?(componentId: string, css: string): string;
  /** Renderer-specific `@defer` triggers; returns a dispose function. */
  observeTrigger?(name: string, args: unknown[], placeholder: N | undefined, fire: () => void): () => void;
  /** Optional DOM-state preservation around a view rebuild (HMR). */
  captureViewState?(rootNodes: N[]): unknown;
  restoreViewState?(newRootNodes: N[], token: unknown): void;
}
