import { html, injectHost } from "@gable/core";
import { currentScope } from "@gable/core/internal";

/**
 * Renders its projected content in the renderer's overlay root (`Renderer.overlayRoot()`: `document.body` under the
 * DOM renderer) instead of where it is written, so overlays escape ancestor `overflow`, `z-index` and `transform`.
 *
 *   <ui-portal>
 *     <div uiDialogBackdrop></div>
 *     <div uiDialogPositioner>...</div>
 *   </ui-portal>
 *
 * What moves is the `<ui-portal>` element (styled `display: contents`) with its content. Nothing else changes:
 * the content is still built in the declaring component's Env and injector, so bindings, events and injected
 * state (a `DialogState` provided by the declaring component) keep working, and Zag machines still find their
 * parts by id because the overlay root is in the same document. When the portal's scope is disposed (an `@if`
 * turns false, the parent is destroyed) the element is removed from the overlay root.
 *
 * Requirements and limits:
 * - The renderer must implement `overlayRoot()`; otherwise Setup throws an error naming the renderer.
 * - Do not put a portal directly inside a keyed `@for` row that gets reordered: the row move re-inserts the host
 *   in its original parent. Put the `@for` inside the portal instead.
 * - Content stays in the overlay root for the portal's whole life; wrap it in `@if` to create it only while open.
 */
export class UiPortal {
  static meta = { selector: "ui-portal", template: html`<slot></slot>` };
  private _move = movePortalHost();
}

function movePortalHost(): true {
  const { renderer, host } = injectHost<unknown>();
  if (!renderer.overlayRoot) {
    throw new Error(
      `<ui-portal> needs a renderer with overlayRoot(); the "${renderer.name ?? "unnamed"}" renderer does not provide one. ` +
        `Implement Renderer.overlayRoot() (the DOM renderer uses document.body), or render the content in place without a portal.`,
    );
  }
  renderer.setStyle(host, "display", "contents");
  // The host was inserted into its parent just before Setup, so this move is the last placement.
  renderer.insert(renderer.overlayRoot(), host);
  currentScope()?.onDispose(() => renderer.remove(host));
  return true;
}
