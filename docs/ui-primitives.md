# @gable/ui-primitives

The shared layer under gable-ui components. It uses Zag.js wherever Zag already has the behaviour and adds only Gable seams: signals instead of Zag's subscribe API, scope-owned cleanup, and renderer awareness. Related notes: `docs/ui-items.md` (rendering items for Select, Combobox and Menu), `docs/library-authors.md` (`injectHost`).

All utilities are `use*` functions that must be called in Setup (a field initialiser), with a matching attribute directive for the common case. Everything they install is removed when the owning scope is disposed. Under a renderer that is not a DOM (the in-memory test renderer) the DOM-only utilities (layer, positioning) install nothing; test their behaviour in jsdom. `MACHINE_ENV.effects` overrides this check.

| Utility | Function | Directive | Built on |
| --- | --- | --- | --- |
| Dismissable layer stack, focus trap and restore, scroll lock, hide outside | `useLayer` | `uiLayer` | `@zag-js/dismissable`, `focus-trap`, `remove-scroll`, `aria-hidden` |
| Positioning | `usePosition` | `uiPosition` | `@floating-ui/dom` |
| Roving tabindex | `useRovingTabindex` | `uiRoving`, `uiRovingItem` | Gable (no Zag equivalent outside its machines) |
| Virtual scroll | `useVirtualizer`, `createVirtualizer` | none (templates cannot reach a directive's state) | Gable (see `virtual-core.ts`, `virtual.ts`) |
| Portal, presence | `UiPortal`, `usePresence` | `ui-portal`, `ui-presence` | Gable (see `portal.ts`, `presence.ts`) |
| Machines | `useMachine`, `bindProps`, `machineState` | Dialog, Tabs, Popover, Tooltip, Select | `@zag-js/*` |

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

## Machine state: `machineState`

`machineState(prefix, machine, connect)` returns an injectable class (`id`, `api()` signal, `bind(propsFn)`) so a component and its directives share one machine: list the class in `providers`, call `inject(State).bind(() => props)` in the component, and the part directives inject it. `DialogState`, `TabsState`, `PopoverState`, `TooltipState` and `SelectState` are built this way.

Projected content (a slotted trigger, a `<ui-tab>`) injects from the component that *declares* it, not from the component that hosts it, so it cannot inject the state. gable-ui uses an owner push: the host component reads the child with `contentChild`/`contentChildren` and an effect sets `child.owner.set(state)`; the child binds its props from `owner()`. Tooltips are a directive on the trigger itself (`[uiTooltip]`) that owns its machine and builds the overlay nodes through the renderer.

## Virtual scroll: `useVirtualizer`

Long lists and tables render only the rows in view, so 100,000 rows cost about twenty nodes. The host is the scroll container (give it a height and `overflow: auto`); inside it a spacer takes the whole list height and each rendered row positions itself with `transform`:

```ts
list = useVirtualizer({ count: () => rows().length, itemSize: 36, getKey: (i) => rows()[i].id });
visible = computed(() => this.list.rows().map((r) => ({ ...r, name: rows()[r.index].name })));
```

```html
<div [attr.style]="list.spacerStyle()">
  @for (row of visible(); track row.key) { <div [uiProps]="row.props">{{ row.name }}</div> }
</div>
```

Templates cannot call `list.itemProps(item)` or index an array, so `rows()` hands back each item with its attribute bag (`props`) and you map your data in with a computed. The `@for` is the usual keyed one: `track row.key` is `getKey(index)` (the index when there is no `getKey`), so scrolling moves rows instead of rebuilding them, and data changes (insert, reorder, remove) keep measured heights with their rows.

- **Heights.** `itemSize` (a number, or a function so a component input can drive it) fixes every height: no measuring. Without it rows are measured by a `ResizeObserver` (found by their `data-index`) and `estimateSize` (default 40) stands in until then. A measured height shifts only the rows below it.
- **Window.** Overscan (default 5 rows each side), `paddingStart`/`paddingEnd`, and `initialViewport` (the height assumed until the host is measured).
- **`scrollToIndex(index, { align: "start" | "center" | "end" | "auto", behavior })`.** With variable heights the target is re-aimed as rows above it get measured, until the position holds (or the user scrolls, or 600 ms pass).
- **Sticky headers.** `stickyIndexes: () => [0, 100, 200]` (ascending): the nearest one at or above the first visible row is always rendered, with `position: sticky; top: 0`. `scrollPaddingStart` keeps `scrollToIndex` clear of such a header; a header placed before the spacer (a table head) is `viewportInset` instead.
- **Accessibility.** `aria: "list"` (default) puts `aria-setsize` (the whole count) and `aria-posinset` on each rendered item, so a screen reader hears "item 5,000 of 100,000". `aria: "grid"` puts `aria-rowindex` on each row and `aria-rowcount` on the container (`rootProps()`; `headerRows` counts a header row above). `itemRole` sets each row's role; the container's role is yours (`list`, `grid`...).
- **Keyboard** (`keyboard: true`): roving tab stop; arrows, Home, End, PageUp and PageDown move the active row, scroll it into view and focus it. The active row is always rendered, so scrolling away does not destroy focus.

The engine (`createVirtualizer`, `virtual-core.ts`) is plain signals with no DOM: the range is a binary search over prefix sums, and `items()` only changes when the window does. It is written here rather than built on `@tanstack/virtual-core`: TanStack's core is a class with its own subscribe and notify cycle that would sit between the scroll event and Gable's signals, rebuilds its item list on every change, and would add a dependency to a package gable-ui copies out of; the logic Gable needs (range search, measured sizes by key, scroll-to alignment, sticky) is small. Under a renderer without a DOM host (the in-memory renderer) drive it with `setScroll(offset, viewport)` and `measure(index, size)`: a scroll event whose `target` carries `scrollTop` and `clientHeight` works too. Benchmarks are in `docs/performance.md` (`examples/virtual-benchmark`); `examples/ui-gallery/virtual.html` is a 100,000-row demo; `ui-virtual-list` and `ui-virtual-table` in gable-ui are ready-made versions. Limits: vertical only, text-cell tables, no horizontal virtualisation.

## gable-ui (`packages/ui`, `@gable/ui`)

Button, Dialog, Popover, Tabs, Tooltip, Select, Sortable, Label, Input, Textarea, Checkbox, Switch, Radio Group, Slider, Toggle, Toggle Group, Badge, Card, Alert, Separator, Skeleton, Progress, Avatar, Accordion, Collapsible, Dropdown Menu, Context Menu, Combobox, Alert Dialog, Sheet, Drawer, Table, Breadcrumb, Pagination, Scroll Area, Hover Card, Virtual List, Virtual Table, Tree, JSON Viewer, and Form and Field, in the shadcn neutral style (Tailwind v4, `tw-animate-css`, lucide icons, CSS variables in `theme.css`). One file per component in `src/components`, helpers (`cn`, `variants`, `useHostClass`, `UiIcon`) in `src/lib`, so a component can be copied into an app. Templates cannot call functions, so variant classes are computed view models (`variants()` is a small cva). `data-state="open|closed"` drives the enter and exit animations; the exit runs because `usePresence` delays `hidden`. A `class`/`*Class` input merges over the defaults with `tailwind-merge`. The package is private for now (`"gablePack": true` makes `scripts/pack-local.mjs` pack it). `registry-meta.ts` lists each component file with its npm, component and lib dependencies (a test keeps it in step with the imports). Machines are exposed as `*State` classes in `@gable/ui-primitives` (`machines.ts`); `[uiProps]` and `[uiPopup]` spread a computed Zag prop bag onto an element, so a template can render any part. Stateful parts that live in projected content (accordion items, menu and collapsible triggers) are wired by the parent with `contentChild` plus an effect that hands them the state (the owner push). Form controls follow the `[field]` convention (`value` model, `invalid`/`disabled`, `touched` output). `ui-form` + `ui-field` + `uiFieldControl` add labels, descriptions and error text over `Form<T>`: `<ui-field [state]="form.email.state">` (a field itself would be a bare signal in a template). `examples/ui-gallery` shows them all: `npm run pack:local examples/ui-gallery`, then in that folder `npm install` and `npm run dev`.

## Testing

Machines that read the DOM at connect time (checkbox, switch, menus, combobox, accordion keyboard, scroll area) need jsdom: `// @vitest-environment jsdom` plus `useDomApp()` from `packages/ui/src/test-utils.ts`, which also gives every animation frame its own task. Others run on the in-memory renderer with `provideTestDom()`.

- Layer and positioning need a DOM: use jsdom (`// @vitest-environment jsdom`, the DOM renderer). jsdom has no layout, so for positioning mock `getBoundingClientRect`, `offsetWidth/Height`, `clientWidth/Height` (see `position.dom.test.ts`), and dispatch `resize`/`scroll` to trigger updates. Use the per-task `requestAnimationFrame` patch from `dom.test.ts`.
- gable-ui: in-memory tests per component (structure, state, two-way bindings; Zag effects such as hover timers, Escape and outside click are off in memory) plus jsdom tests (`overlays.dom.test.ts`, `tooltip.dom.test.ts`, helpers in `packages/ui/src/test-utils.ts`: ResizeObserver/IntersectionObserver/scrollTo stubs, no PointerEvent).
- Roving, and the "installs nothing" behaviour of layer and positioning, are covered in the in-memory renderer (`primitives.test.ts`).

## Dependencies

`@zag-js/dismissable`, `focus-trap`, `remove-scroll`, `aria-hidden` (layers), `@floating-ui/dom` (positioning), plus the machines `dialog`, `tabs`, `popover`, `tooltip`, `select`, `combobox`, `menu` and `@zag-js/vanilla`, `@zag-js/core`.

## Drag and drop (TASK-43)

Pointer-event based (not HTML5 drag and drop), with a keyboard alternative and screen-reader announcements. DOM renderer only (it uses pointer events, `getBoundingClientRect` and `getComputedStyle`). Files: `dnd-manager.ts` (the session engine, one per document), `dnd.ts` (`uiDraggable`, `uiDragHandle`, `uiDropZone`), `dnd-sortable.ts` (`uiSortable`, `uiSortableItem`, `applySortableMove`), `dnd-announce.ts` (live region and messages). gable-ui adds `<ui-sortable>` (`packages/ui/src/components/sortable.ts`).

```html
<!-- draggable and drop zone -->
<div [uiDraggable]="note" dragGroup="trash" dragLabel="Sticky note">Sticky note</div>
<div uiDropZone dropGroup="trash" dropLabel="Trash" (dropped)="remove($event.data)">Drop here</div>

<!-- sortable lists; moved fires on the list the item lands in, removed on the list it left -->
<ul [uiSortable]="todo()" sortableId="todo" sortableGroup="board" sortableLabel="To do" (moved)="apply($event)" (removed)="apply($event)">
  @for (task of todo(); track task.id) {
    <li [uiSortableItem]="task.id"><span uiDragHandle>::</span>{{ task.title }}</li>
  }
</ul>

<!-- the ready-made version: rows are { id, label, description?, disabled? } and [(items)] is updated for you -->
<ui-sortable name="todo" group="board" label="To do" [handle]="true" [(items)]="todo"></ui-sortable>
```

**Data flow.** Nothing moves the DOM by itself. A drop reports a `SortableMove` (`id`, `data`, `from: { container, index }`, `to: { container, index }`, where `to.index` is the final position in the destination list) and you update your arrays; the keyed `@for` re-renders. `applySortableMove(list, move, containerId, idOf)` does the reorder / insert / remove for one list (`arrayMove` is the plain helper). Drops that change nothing are not reported. Item ids must be unique in the document (also across lists). `sortableId` / `name` is the container name that moves report; it defaults to a generated id.

**Pointer.** Press an item (or its `uiDragHandle` if it has one: then only the handle starts a drag) and move more than 4px. A clone of the item follows the pointer as a `position: fixed` element in the renderer's overlay root (the same place `<ui-portal>` renders, `document.body` under the DOM renderer), with `[data-dnd-preview]`, `aria-hidden` and no ids. The original gets `[data-dragging]`, the list under the pointer `[data-drop-over]` and the item at the insertion point `[data-drop-position="before|after"]` (style these; `ui-sortable` does). `<html>` gets `data-dnd-active` while a drag runs (for `cursor: grabbing`). Escape and `pointercancel` cancel; the click that follows a drag is swallowed. Zones are hit-tested by rectangle and the innermost wins, so a sortable inside another drop zone works. Touch: the draggable or its handle gets `touch-action: none`, so on touch screens give lists a handle or the page cannot scroll from the rows.

**Keyboard.** Focus an item (sortable items use one roving tab stop; arrows move focus while nothing is lifted), space lifts it, arrows move it, space drops, Escape cancels, Tab cancels and moves on. In a vertical list Up and Down change the position and Left and Right jump to the previous or next list of the same group (in a horizontal list the pairs swap). A plain `uiDraggable` has no list: any arrow picks the previous or next accepting drop zone. After a drop focus returns to the moved item (a keyed re-render may drop it).

**Groups.** A drop target accepts a dragged item when both have the same group, or neither has one. `dropAccept` (a predicate on the data) narrows a plain drop zone further.

**Auto scroll.** During a pointer drag, when the pointer is within 48px of the edge of the nearest scrollable ancestor of the zone under it (or of the dragged item), that container scrolls each animation frame, faster nearer the edge; the window scrolls the same way. `autoScrollDelta` is the pure speed function and `getDndManager(document).autoScrollTick()` runs one step (tests drive it).

**Announcements.** There is no shared LiveAnnouncer yet, so drag and drop owns a minimal internal live region (`<div aria-live="assertive" aria-atomic="true" data-dnd-live>`, visually hidden, appended to `document.body` on first use) in `dnd-announce.ts`; when a shared announcer exists, replace `announce()` there. Messages (English): picked up (with position and list), moved to position N of M in list, over zone, dropped, cancelled. Items carry `aria-roledescription` and `aria-describedby` pointing at a hidden element with the keyboard instructions. `setDndMessages({ ... })` replaces any string or function (translations); `setDndMessages({})` restores the defaults. Spoken names come from `label` / `dragLabel` / `dropLabel` / `sortableLabel`, falling back to the element text.

**Limits.** Vertical and horizontal lists only (no wrapping grids); one drag at a time; items must be descendants of their list (`[data-sortable-id]`), nested sortables are separate lists; custom drag preview is `preview: "none"` or a function (programmatic `useDraggable` / `useSortable`). Not yet verified: feel in real browsers and with a screen reader (jsdom covers the logic with mocked rects).

**Try it.** `npm run pack:local examples/ui-gallery`, then in that folder `npm install` and `npm run dev`, and open `/dnd.html` (a second page of the gallery, dev server only): a sortable playlist with grips, a three-column kanban and a draggable with a drop zone. Tests: `dnd.dom.test.ts` (primitives), `sortable.dom.test.ts` (ui) and `src/dnd-examples.test.ts` (gallery), all jsdom with mocked layout.

## Toast (TASK-47)

`ToastService` (root scoped) is the API and `<ui-toaster>` the region, both in `packages/ui/src/components/toast.ts`. Zag's toast machine was not used: it needs a store plus a region and adds a dependency for what is a list signal, a few timers and `[uiPresence]`.

```ts
toast = inject(ToastService);
this.toast.success("Saved", { description: "Your changes are live." });
this.toast.error("Upload failed", { action: { label: "Retry", onClick: () => this.upload() } });
this.toast.promise(save(), { loading: "Saving...", success: "Saved", error: (e) => `Failed: ${e}` });
this.toast.dismiss(id); // or dismiss() for all
```

```html
<ui-toaster position="bottom-right" [limit]="5"></ui-toaster>
```

- Put one `<ui-toaster>` in the app. It renders through `<ui-portal>` (the overlay root), as a labelled region ("Notifications").
- `show`, `success`, `error`, `info`, `warning`, `loading`, `promise` return the toast id (`promise` returns the promise). Reusing an `id` updates a toast in place. Default duration 4000 ms; `0`/`Infinity` and loading toasts stay until dismissed.
- Announcements go through `LiveAnnouncer` (errors assertive, the rest polite), so a toast is spoken even though it is inserted after the page loaded. The visible toasts carry no live role of their own, to avoid a double announcement.
- Hovering or focusing the region calls `pause()`; leaving calls `resume()` and each toast keeps the time it had left.
- Items use `[uiPresence]` with `data-state` animations (`animate-in`/`animate-out`, off under `motion-reduce`), so a dismissed toast stays mounted until its exit has played.
- Status icons use the `--success`, `--info` and `--warning` theme tokens (`text-success` etc., defined in `theme.css` for light and dark; `error` uses `--destructive`).
- A toast can be swiped toward the nearest side edge (`uiDrawerDrag` on each item, so the drawer's pointer engine, slop and fling rules apply); `hotkey` (default `alt+t`, `""` disables) focuses the region from anywhere, which pauses the timers.
- Not included: stacking/collapsing of the overflow beyond `limit` (older toasts are just hidden).

## Carousel: `useCarousel`

Behaviour for a CSS scroll-snap carousel (`<ui-carousel>` is built on it; Zag's carousel machine was not used, see below). The viewport scrolls natively and snaps; `useCarousel({ count, loop?, autoplay? })` finds `[data-carousel-viewport]` and its `[data-carousel-slide]` descendants under the host and returns `index`, `playing`, `autoplaying`, `reducedMotion`, `canPrev`, `canNext` (signals) and `goTo`, `prev`, `next`, `toggle`.

- The in-view slide is the one whose start edge is nearest the viewport's (read on the captured `scroll` event). While `goTo` scrolls, intermediate slides are ignored until the target is reached or 700 ms pass.
- Left/Right/Home/End from anywhere inside the host (not from inputs). Horizontal and left-to-right only.
- Autoplay (`autoplay` is a delay in ms) pauses while the pointer is over the host or keyboard focus (`:focus-visible`) is inside it, when the document is hidden, and never runs under `prefers-reduced-motion` (scrolling is then not smooth). `toggle()` is the user's play/pause (WCAG 2.2.2). `autoplaying` is true only while a timer is really advancing; the component uses it to set `aria-live` to `off` and otherwise `polite`.
- DOM only: under the in-memory renderer it tracks `index` and `playing` and touches nothing.

## Drawer drag: `useDrawerDrag` / `uiDrawerDrag` (TASK-48)

Drag-to-dismiss and snap points for an edge panel (`drawer-drag.ts`). `<ui-drawer>` in gable-ui is a Dialog (focus trap, scroll lock, Escape, backdrop and `usePresence` animation all come from the dialog machine and layer) with this on its panel.

```html
<div uiDrawerDrag side="bottom" [open]="open()" [snapPoints]="[0.4, 1]" [activeSnap]="snap()" (dismiss)="open.set(false)" (snapChange)="snap.set($event)">...</div>
```

- **`DrawerDragEngine`** has no DOM and no signals: `start`, `move`, `end` take `{ x, y, time }` samples and it calls `onMove(offset, dragging)`, `onSnap(fraction)` and `onDismiss()`. Test it with plain numbers (`drawer-drag.dom.test.ts`).
- A press becomes a drag after 4px along the axis (mostly across the axis abandons it); dragging toward the open side is rubber-banded. On release, speed over the last 100ms decides first (above 0.4px/ms moves one snap point in that direction, past the lowest one dismisses), otherwise the nearest snap point wins, and dismissal needs the panel dragged half way below the lowest snap point. Snap points are visible fractions, ascending (`[0.4, 1]`).
- **`useDrawerDrag`** listens for pointer events on the host (pointer capture; mouse, touch and pen) and writes an inline `transform` and `transition`. A press on a form control, button, link or `[data-drawer-no-drag]`, or inside a scroller not at its edge, never drags. Give the grab area `touch-action: none`, or a touch scrolls instead.
- After a drag dismissal the host has `data-dragged` and sits off screen with a `transition`; the owner closes and `usePresence` waits for that transition, so CSS should drop its exit animation (`data-[dragged]:data-[state=closed]:animate-none`). Opening again (`[open]` true) clears it.
- Closing without a drag (Escape, a button) from a snap point below full calls `handle.exit()`: the panel slides out from where it rests (`data-dragged` drops the CSS exit). At full height the CSS exit runs as before. Changing the active snap while open animates (`setSnap(fraction, true)`), and the `progress` output (`{ value, dragging }`, the visible fraction) drives `<ui-drawer>`'s backdrop opacity.
- Limits: no nested-drawer scaling.

## Command, date picker and OTP additions (TASK-46, 50, 52)

- **Command:** `filter` (on `ui-command` and `ui-command-dialog`) takes `(items, query) => items`. The default `substringFilter` is the original rule (every word a substring of label, group or keywords, items keep their order); `fuzzyFilter` matches subsequences (every word still has to match) and ranks prefix, word-start and contiguous matches first, a label above keywords above the group, with a stable sort.
- **Calendar:** `captionLayout="dropdown"` (or `dropdown-months` / `dropdown-years`) adds native month and year selects (years from `min` to `max`, else 100 back and 10 ahead; picking clamps to `min`/`max`); the text heading stays, visually hidden, as the grid's name. `locale` also takes a function returning a date-fns `Locale`, read inside computeds, for a lazily loaded locale. Wiring to the I18n service is not done.
- **Date picker:** `[typeable]="true"` (single mode) adds a text input; the date is parsed with date-fns using `displayFormat` on Enter, change or blur, and must pass `min`, `max` and `isDisabled`, otherwise the input is `aria-invalid` and the value is unchanged. An empty box clears. `captionLayout` goes to the calendar.
- **Input OTP:** `dir` (`auto` follows the nearest `dir` attribute) swaps ArrowLeft and ArrowRight under `rtl`.

## Resizable panels: `ResizeEngine` (TASK-53)

`ResizeEngine` (`resize.ts`) is the logic of a resizable panel group with no DOM: panel sizes as percentages that always total 100 (`sizes()` signal), `configure(panels, savedLayout?)`, pointer drags (`startDrag(handle, pos, containerPx)`, `dragTo(pos)`, `endDrag()`) and keys (`key(handle, "ArrowRight" | "Home" | "End" | "Enter")`). A handle moves its two neighbours only, inside each panel's `minSize`/`maxSize`; a `collapsible` panel dragged past halfway below its minimum snaps to `collapsedSize` and back out the same way, and remembers its size for `expand`. `handleState(i)` gives the `aria-valuenow/min/max` of the panel before the handle (the ARIA window splitter pattern; Enter toggles a collapsible neighbour, arrows never leave a panel between collapsed and minimum). Test it with plain calls, no pointer events needed; `ui-resizable-panel-group`, `ui-resizable-panel` and `ui-resizable-handle` in gable-ui wire it to pointer events (the group's pixel size is read at pointer-down), `[(layout)]` and an optional `autoSaveId` (localStorage, guarded). Limits: a handle never cascades into panels beyond its neighbours, and panels are matched to handles by creation order.

## Button group and the split-button recipe (TASK-73)

`ui-button-group` (`packages/ui/src/components/button-group.ts`) is a flex row (or column) of joined buttons: one `role="group"`, named by `label` (becomes `aria-label`; give it one whenever the group holds more than one control). `orientation` is `horizontal` (default) or `vertical`. As in shadcn's ButtonGroup, joined borders and radii come from child selectors on the group (`[&>*:not(:first-child)]:rounded-l-none` and so on), so children keep their own variant; a focused child is raised so its ring is not clipped. `[uiButtonGroupText]` is a non-interactive addon (a prefix, a unit); `[uiSeparator]` works between children. The `class` input merges last.

shadcn has no split button; it is a Button joined to a Dropdown Menu trigger inside a group. This is the recipe, with no extra component:

```html
<ui-button-group label="Save options">
  <button uiButton (click)="save()">Save</button>
  <ui-dropdown-menu [entries]="entries" (selected)="run($event)" placement="bottom-end">
    <button slot="trigger" menuTrigger uiButton size="icon" aria-label="More save options"><svg uiIcon="chevron-down"></svg></button>
  </ui-dropdown-menu>
</ui-button-group>
```

- One accessible name for the pair: the group's `label`. The primary button keeps its own visible text.
- The chevron trigger needs its own name (`aria-label`), since it has only an icon. `menuTrigger` adds `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`; do not add them by hand.
- `ui-dropdown-menu` wraps its trigger, so the group also has selectors for a `ui-dropdown-menu` child (`[&>ui-dropdown-menu:not(:first-child)>*]`); only a dropdown menu is handled that way.
- `placement="bottom-end"` keeps the menu under the chevron at the group's right edge.

Tests: `button-group.test.ts` (in-memory: attributes and classes) and `button-group.dom.test.ts` (jsdom: the recipe, menu semantics, axe via `@gable/testing/a11y`). The runnable example is `examples/ui-gallery/button-group.html` (after `npm run pack:local examples/ui-gallery`).

## Tree view and JSON viewer (TASK-71, TASK-72)

`ui-tree` (`packages/ui/src/components/tree.ts`) is a file-explorer / inspector tree. It is native, not `@zag-js/tree-view` (not installed; Zag's parts are nested and recursive, while a flattened list of visible nodes is what lets the tree virtualise and render with a plain `@for`, and what makes per-level `aria-setsize` / `aria-posinset` cheap). Nodes are data: `{ id, label, children?, lazy?, disabled?, icon?, description?, descriptionClass?, actions? }`; `expanded` and `selected` are two-way arrays of ids; `selectionMode` is `none | single | multiple`.

```html
<ui-tree label="Files" class="h-72" [nodes]="files" [(expanded)]="open" [(selected)]="picked" selectionMode="multiple" [loadChildren]="load" (activated)="show($event)"></ui-tree>
<ui-tree label="Big" [virtual]="true" [itemSize]="28" [nodes]="tenThousandNodes" [(expanded)]="open"></ui-tree>
```

- **ARIA.** The host is `role="tree"` (`aria-multiselectable`), every visible node is a flat `role="treeitem"` carrying `aria-level`, `aria-setsize`, `aria-posinset` (among its siblings), `aria-expanded` (branches only), `aria-selected` (when selectable), `aria-disabled`, `aria-busy` while lazy children load. One row has `tabindex="0"` (roving); its action buttons are the only tabbable buttons.
- **Keyboard.** Up/Down, Right (open, then step into the first child), Left (close, then to the parent), Home/End, `*` (open siblings), type-ahead (500 ms buffer), Enter (select and `activated`), Space (select; toggles in `multiple`), Shift+Arrow and Shift+click (range), Ctrl/Meta+click (toggle), Ctrl+A. Disabled rows are skipped. A click on the chevron only expands.
- **Lazy.** `lazy: true` plus `loadChildren(node)` (array or promise; the result is cached until `nodes` changes; `loadFailed` fires on error).
- **Virtual.** `virtual` flattens the visible nodes (`flattenTree`, iterative) and renders them through `useVirtualizer` with a fixed `itemSize`; the focused row is always rendered (`keepIndexes`), keyboard moves `scrollToIndex` then focus. Tests: 10,100 nodes render about 20 rows (`tree.dom.test.ts`, `tree.test.ts`); flattening 10,000 nodes takes a few ms. Like the virtual list it needs a real element, so jsdom tests mock `clientHeight` and dispatch `scroll`.
- **Row actions.** `actions: [{ id, label, text? }]` render small buttons and emit `(action)` with `{ node, action }`.
- Not covered: drag and drop reordering, checkbox (tri-state) trees, horizontal virtualisation, variable row heights in `virtual` mode, async expand-all.

`ui-json-viewer` (`json-viewer.ts`, registry dependency `tree`) shows any value: `<ui-json-viewer [value]="response" label="Response" [maxDepth]="6" [maxString]="120" [chunkSize]="100"></ui-json-viewer>`. Children are built when a node first opens (through the tree's `loadChildren`), so a huge value costs what is open. Primitives are coloured with theme tokens (`text-success` strings, `text-info` numbers/bigints/dates, `text-warning` booleans, muted null/undefined/functions). Each row has `path` and `value` buttons (`navigator.clipboard`, guarded; `copied` emits `{ kind, text, ok }`, `ok: false` without a clipboard) and "Expand all" / "Collapse all" buttons (expand all stops after `expandLimit` nodes). Long strings are cut at `maxString`; a reference back to an ancestor shows `[Circular]`; containers below `maxDepth` show their size and stay closed; containers with more than `chunkSize` entries group as `[0..99]`, nested for very long ones (100,000 items open as ten rows). Paths look like `$.items[0]["odd key"]`. Maps and Sets are shown as containers. Not covered: search/filter, editing, class-instance names.

Gallery: `examples/ui-gallery/tree.html` (`src/tree-demo.ts`); run `npm run pack:local examples/ui-gallery` once so the gallery sees the new components.
