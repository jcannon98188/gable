# @gable/ui-primitives

The shared layer under gable-ui components. It uses Zag.js wherever Zag already has the behaviour and adds only Gable seams: signals instead of Zag's subscribe API, scope-owned cleanup, and renderer awareness. Related notes: `docs/ui-items.md` (rendering items for Select, Combobox and Menu), `docs/library-authors.md` (`injectHost`).

All utilities are `use*` functions that must be called in Setup (a field initialiser), with a matching attribute directive for the common case. Everything they install is removed when the owning scope is disposed. Under a renderer that is not a DOM (the in-memory test renderer) the DOM-only utilities (layer, positioning) install nothing; test their behaviour in jsdom. `MACHINE_ENV.effects` overrides this check.

| Utility | Function | Directive | Built on |
| --- | --- | --- | --- |
| Dismissable layer stack, focus trap and restore, scroll lock, hide outside | `useLayer` | `uiLayer` | `@zag-js/dismissable`, `focus-trap`, `remove-scroll`, `aria-hidden` |
| Positioning | `usePosition` | `uiPosition` | `@floating-ui/dom` |
| Roving tabindex | `useRovingTabindex` | `uiRoving`, `uiRovingItem` | Gable (no Zag equivalent outside its machines) |
| Portal, presence | `UiPortal`, `usePresence` | `ui-portal`, `ui-presence` | Gable (see `portal.ts`, `presence.ts`) |
| Machines | `useMachine`, `bindProps` | Dialog, Tabs | `@zag-js/*` |

## Layer: `useLayer` / `uiLayer`

```ts
export class Popover {
  static meta = { selector: "x-popover", template: html`<slot></slot>` };
  open = signal(false);
  layer = useLayer({ open: () => this.open(), onDismiss: () => this.open.set(false), modal: false });
}
```

```html
<div uiLayer [open]="open()" (dismiss)="open.set(false)">...</div>
<div uiLayer [modal]="false" [open]="menuOpen()" (dismiss)="menuOpen.set(false)">...</div>
```

A layer never closes itself: `onDismiss(reason)` (`"escape" | "outside-click" | "focus-outside"`) tells the owner, who sets its open state. The layer's behaviours are installed while `open()` is true.

**Layer stack.** The stack is Zag's (`@zag-js/dismissable`), the same one Zag machines such as the Dialog use, so a `useLayer` popover above a Zag dialog nests correctly.
- Escape is delivered to the topmost layer only.
- A pointer press or focus move outside is also delivered to the topmost layer only (Zag offers it to every layer; Gable vetoes the lower ones). A second press closes the next layer.
- A press inside a nested layer is not "outside" for its parents, even when the nested layer is portalled elsewhere in the DOM.
- When a layer is removed the layers nested above it are asked to close.
- Topmost is read from the `--layer-index` custom property Zag sets on layer elements (the stack object is not exported); `hidden` elements are ignored because closed Zag machines leave a stale marker.
- `closeOnEscape: false` / `closeOnOutside: false` turn one trigger off. `persistentElements` (e.g. the trigger) never count as outside.

**Modal behaviours** (default on; `modal: false` turns all off, or override one with `trapFocus`, `scrollLock`, `hideOutside`):
- Focus trap and restore (`@zag-js/focus-trap`): Tab cycles inside the layer; focus returns to the previously focused element on close (`restoreFocus: false` to opt out). `initialFocus` picks the first focus target. A layer with nothing tabbable gets `tabindex="-1"` as a fallback target while open.
- Scroll lock (`@zag-js/remove-scroll`): body scroll is locked; nested layers share the lock and it is released when the last modal layer closes.
- Hide outside (`@zag-js/aria-hidden`): everything outside the layer (including lower layers) gets `aria-hidden="true"`; restored when the layer closes. A lower layer becomes visible to assistive technology again when the layer above it closes.

Portal the layer's element (`<ui-portal>`) so it sits in the overlay root; the layer follows the element, not its declared position.

## Positioning: `usePosition` / `uiPosition`

```html
<button id="trigger">Open</button>
<div uiPosition="trigger" placement="bottom-start" [offset]="8" [open]="open()" style="width: max-content">...</div>
```

Places the element with `computePosition` and sets `position`, `left`, `top` and `data-placement` (the placement after flipping; also the `placement` signal of `usePosition`). Options: `anchor` (an element or an id, read reactively), `placement`, `offset`, `strategy`, `flip` and `shift` (on by default), `sameWidth` (`--anchor-width`, `--available-height`), `open` (positioning runs only while true).

While positioned it uses `autoUpdate`: scroll of the anchor's and the element's ancestors, window resize and element resize, with all listeners removed when `open` turns false, when the anchor changes and when the scope is disposed (the element is removed, or the app destroyed). A computation that finishes after disposal is dropped. `update()` re-computes on demand.

The `uiPosition` directive does not offer `flip`, `shift` or `sameWidth` inputs; use `usePosition` for those. The anchor must be in the same document.

## Roving tabindex: `useRovingTabindex` / `uiRoving`

One item of a group is in the tab order (`tabindex="0"`), the rest are `-1`. Arrow keys (per `orientation`: `horizontal` default, `vertical`, `both`), Home and End move focus and the tab stop; disabled items (`disabled` or `aria-disabled="true"`, or your `isDisabled`) are skipped; `loop` wraps (default true); `rtl` swaps Left and Right. Focus entering an item by click or tab moves the tab stop to it.

```html
<div uiRoving orientation="vertical" role="toolbar">
  <button uiRovingItem>Cut</button>
  <button uiRovingItem [disabled]="!canCopy()">Copy</button>
</div>
```

`uiRoving` collects `[data-roving-item]` descendants (`uiRovingItem` sets the attribute; `rovingSelector` changes the selector) and watches the subtree for added or removed items with a `MutationObserver`. `useRovingTabindex` is renderer neutral: pass `items` (and `focus`) to use it with other renderers, and call `refresh()` after the items change (it re-applies on its own when a signal read by `items` changes). Zag machines for tabs and menus already do their own roving; use this for widgets without a machine.

## Testing

- Layer and positioning need a DOM: use jsdom (`// @vitest-environment jsdom`, the DOM renderer). jsdom has no layout, so for positioning mock `getBoundingClientRect`, `offsetWidth/Height`, `clientWidth/Height` (see `position.dom.test.ts`), and dispatch `resize`/`scroll` to trigger updates. Use the per-task `requestAnimationFrame` patch from `dom.test.ts`.
- Roving, and the "installs nothing" behaviour of layer and positioning, are covered in the in-memory renderer (`primitives.test.ts`).

## Dependencies

`@zag-js/dismissable`, `focus-trap`, `remove-scroll`, `aria-hidden` (layers), `@floating-ui/dom` (positioning), plus the machines `dialog`, `tabs`, `select`, `combobox`, `menu` and `@zag-js/vanilla`, `@zag-js/core`.
