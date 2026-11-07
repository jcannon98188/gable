# @gable/ui-primitives

The headless, accessible layer under the gable-ui components: dialogs, tabs, popovers, tooltips, selects, a dismissable layer stack, positioning, roving tabindex, virtual scrolling, drag and drop, a carousel engine and resizable panels. There is no markup and no styling. You bring both, and the primitives supply the behaviour and the ARIA. Where Zag.js already has a state machine (dialog, tabs, popover, tooltip, select, combobox, menu), the package wraps it so that state is a signal, listeners are cleaned up with the owning scope and the DOM is reached through the renderer.

## Install

```
npm install @gable/ui-primitives @gable/core
```

Everything is a `use*` function (called in Setup, that is, in a field initialiser) with an attribute directive for the common case. Whatever it installs is removed when the owning scope is disposed. Under a renderer that is not a DOM (the in-memory test renderer) the DOM-only utilities install nothing, so test their behaviour in jsdom.

## A dialog from the parts

A machine is an injectable state class. The component that declares the template lists it in `providers`, binds it in Setup, and the part directives inject it:

```ts
import { html, inject, signal } from "@gable/core";
import { DIALOG, DialogState } from "@gable/ui-primitives";

export class ConfirmDialog {
  static meta = {
    selector: "confirm-dialog",
    providers: [DialogState],
    imports: [...DIALOG],
    template: html`
      <button uiDialogTrigger>Delete</button>
      <div uiDialogBackdrop></div>
      <div uiDialogPositioner>
        <div uiDialogContent>
          <h2 uiDialogTitle>Delete this item?</h2>
          <button uiDialogClose>Cancel</button>
        </div>
      </div>
    `,
  };

  open = signal(false);
  dialog = inject(DialogState).bind(() => ({
    open: this.open(),
    onOpenChange: (d) => this.open.set(d.open),
  }));
}
```

You own the `open` signal, so the dialog is controlled from anywhere. The directives set `role`, `aria-*`, `data-state` and `hidden`; your CSS styles those attributes. The exit animation runs because `usePresence` delays `hidden` until it finishes. Try it, with only a few lines of CSS in the demo:

```demo ui-dialog
The dialog is positioned inside the frame so it stays on the page. The source shows all of its CSS.
```

`TabsState` with `TABS`, `PopoverState` with `POPOVER`, `TooltipState` and `SelectState` follow the same shape. Tabs get roving focus from the machine:

```demo ui-tabs
Arrow keys move and select, Home and End jump to the ends, and the disabled tab is skipped.
```

## Behaviour without a machine

`useRovingTabindex` (directives `uiRoving` and `uiRovingItem`) keeps one item of a group in the tab order. Arrows, Home and End move between enabled items, `loop` wraps, `rtl` swaps Left and Right, and Tab leaves the group:

```html
<div uiRoving orientation="vertical" role="toolbar">
  <button uiRovingItem>Cut</button>
  <button uiRovingItem [disabled]="!canCopy()">Copy</button>
</div>
```

```demo ui-roving
Press Tab once to enter the toolbar, then use the arrows.
```

`useLayer` (`uiLayer`) is the dismissable layer stack: Escape, outside press and focus-outside reach the topmost layer only, and modal layers trap focus, lock scroll and hide the rest of the page from assistive technology. A layer never closes itself; `onDismiss` tells you why, and you set your own state:

```ts
layer = useLayer({ open: () => this.open(), onDismiss: () => this.open.set(false), modal: false });
```

`usePosition` (`uiPosition`) places an element against an anchor with Floating UI: `placement`, `offset`, flip and shift, and `autoUpdate` while it is open.

## What else is in the package

- `useVirtualizer` and `createVirtualizer`: virtual scrolling for long lists and tables, with fixed or measured row heights, sticky headers, `scrollToIndex` and keyboard support. A hundred thousand rows cost about twenty nodes.
- `uiDraggable`, `uiDropZone`, `uiSortable`: pointer-event drag and drop with a keyboard alternative and screen-reader announcements.
- `useCarousel`, `useDrawerDrag` and `ResizeEngine`: the logic of a scroll-snap carousel, a drag-to-dismiss drawer and resizable panels.
- `UiPortal`, `usePresence`, `machineState`, `useMachine` and `bindProps`: the seams for building your own part directives or a machine of your own.

Select, Combobox and Menu items are data rendered with `@for`, one directive per item element. See the [items note](../ui-items.md) for why and the [full primitives notes](../ui-primitives.md) for each utility's options, limits and testing recipes. Ready-made, styled versions of these live in [@gable/ui](./ui.md).

Every exported symbol is documented in the [API reference](/docs/ui-primitives/api).
