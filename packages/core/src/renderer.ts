import type { Provider } from "./di.js";

export { Location, History, Title, Meta, LiveAnnouncer, FocusManager, metaEntries, mergeMeta } from "./platform.js";
export type { MetaTags, MetaEntry, Politeness, FocusTarget } from "./platform.js";

/**
 * The Renderer contract: a small set of synchronous operations over opaque
 * node handles. The core owns templates, bindings, control flow and
 * scheduling; a renderer owns nodes, and the meaning of tags and properties.
 */
/** What a form field's control looks like to the core: the renderer maps values by control type and reports user edits. */
export interface FieldControl {
  /** Shows the field's value in the control (a no-op when it already shows it). */
  write(value: unknown): void;
  /** Applies disabled and readonly, and marks the control invalid (aria-invalid on the DOM). */
  setState(state: { disabled: boolean; readonly: boolean; invalid: boolean }): void;
  /** `value` receives the control's mapped value after user edits; `touched` fires on the first blur. Returns an unsubscribe. */
  listen(handlers: { value(value: unknown): void; touched(): void }): () => void;
}

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
  /** Controls for the `[field]` directive on a native node. Absent: `[field]` on a native element is an error naming this renderer. */
  fieldControl?(node: N): FieldControl;
  /**
   * The node overlays (dialogs, popovers, tooltips) are moved into so they render outside their parent's clipping
   * and stacking context. Optional: a renderer with no overlay layer omits it, and a portal under such a renderer
   * fails with an error naming the renderer. The node must be in the same document/root node as the app (the DOM
   * renderer returns `document.body` or a container in the same document), because machines look parts up by id.
   */
  overlayRoot?(): N;
  /** Optional DOM-state preservation around a view rebuild (HMR). */
  captureViewState?(rootNodes: N[]): unknown;
  restoreViewState?(newRootNodes: N[], token: unknown): void;
}
