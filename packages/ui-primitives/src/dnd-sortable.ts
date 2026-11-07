import { effect, input, output } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import { instructionsId } from "./dnd-announce.js";
import { dragStartsHere, liftsHere, overlayOf, DRAG_HANDLE_ATTR } from "./dnd.js";
import { getDndManager, type DndZone, type DragSource, type DropInfo, type PointerDragOptions, type SortableItemInfo } from "./dnd-manager.js";
import { uniqueId } from "./id.js";
import { useRovingTabindex } from "./roving.js";

/** Attribute carrying an item's id; `uiSortableItem` sets it. */
export const SORTABLE_ITEM_ATTR = "data-sortable-id";

/** What a sortable list knows about each item. `id` must be unique in the document. */
export interface SortableEntry {
  id: string;
  data?: unknown;
  /** Spoken in announcements. Default: the item element's text. */
  label?: string;
  disabled?: boolean;
}

/** A drop in a sortable list. `from.container` is null when the dragged thing was not a sortable item. */
export interface SortableMove<T = unknown> {
  id: string;
  data: T;
  from: { container: string | null; index: number | null };
  /** `index` is the item's final position in the destination list. */
  to: { container: string; index: number };
}

/** Options for `useSortable`. `items` is required and is the source of truth for order; the list is reordered by you in `onMove`, not by the DOM. */
export interface SortableOptions {
  /** The items in order. Read on every pointer move, so it may be a signal read. */
  items: () => readonly SortableEntry[];
  /** Name of this container in `SortableMove` (`from.container`, `to.container`). Default: a generated id. */
  container?: () => string | undefined;
  /** Items move between sortables with the same group; ungrouped lists only reorder themselves. */
  group?: () => string | undefined;
  /** Spoken in announcements ("Position 2 of 5 in To do"). */
  label?: () => string | undefined;
  orientation?: () => "vertical" | "horizontal";
  disabled?: () => boolean;
  preview?: () => PointerDragOptions["preview"];
  /** Roving tabindex across the items (one tab stop, arrow keys move focus while nothing is lifted). Default true. */
  roving?: boolean;
  /** An item was dropped here (reorder inside this list, or arrival from another list). Not called when nothing changed. */
  onMove?: (event: SortableMove) => void;
  /** An item of this list was dropped in another list. */
  onRemove?: (event: SortableMove) => void;
}

/** What `useSortable` returns: the list's container name and a way to re-apply the roving tab stop. */
export interface SortableHandle {
  /** The name moves report for this list. */
  readonly id: () => string;
  /** Re-applies the roving tab stop; needed only after changing the DOM by hand. */
  refresh(): void;
}

/** Returns a copy of `list` with the item at `from` moved so it ends up at `to`. */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/**
 * Applies a `SortableMove` to the list that belongs to container `containerId`: reorders it, inserts the arriving item,
 * removes the departing one, or returns the same list when the move does not involve it. Use it for `(moved)` of every list.
 */
export function applySortableMove<T>(list: readonly T[], move: SortableMove<T>, containerId: string, idOf: (item: T) => string): T[] {
  const into = move.to.container === containerId;
  const out = move.from.container === containerId;
  if (into && out) {
    const from = list.findIndex((x) => idOf(x) === move.id);
    return from < 0 ? list.slice() : arrayMove(list, from, move.to.index);
  }
  if (into) {
    const next = list.filter((x) => idOf(x) !== move.id);
    next.splice(move.to.index, 0, move.data);
    return next;
  }
  if (out) return list.filter((x) => idOf(x) !== move.id);
  return list.slice();
}

type Target = { renderer: Renderer<any>; host: any };

/**
 * Makes the host a sortable container. Items are descendants with `data-sortable-id` (`uiSortableItem`), in the same
 * order as `items()`; the host never reorders the DOM itself: it reports the drop with `onMove` and you update your data,
 * which re-renders the list. While dragging, the item stays in place (`[data-dragging]`), the target item gets
 * `data-drop-position="before|after"` and the host gets `data-drop-over`.
 *
 * - Pointer: press an item (or its `[data-drag-handle]`, if the item has one) and move.
 * - Keyboard: focus an item, space lifts it, arrows move it (along the list; across lists with the other arrow pair),
 *   space drops, escape cancels. Each step is announced in the live region (`dnd-announce.ts`).
 * - `orientation` is `"vertical"` (default) or `"horizontal"`; wrapping grids are not supported.
 */
export function useSortable(options: SortableOptions, target: Target = injectHost<HTMLElement>()): SortableHandle {
  const { renderer, host } = target as { renderer: Renderer<HTMLElement>; host: HTMLElement };
  const doc = host.ownerDocument;
  const manager = getDndManager(doc);
  const id = uniqueId("sortable");
  const name = () => options.container?.() || id;
  const vertical = () => (options.orientation?.() ?? "vertical") === "vertical";
  let keyboard = false;

  const owns = (el: Element) => el.closest("[data-sortable]") === host;
  const elements = (): HTMLElement[] => Array.from(host.querySelectorAll<HTMLElement>(`[${SORTABLE_ITEM_ATTR}]`)).filter(owns);
  const entryOf = (itemId: string) => options.items().find((e) => e.id === itemId);
  const infos = (): SortableItemInfo[] => elements().map((element) => ({ id: element.getAttribute(SORTABLE_ITEM_ATTR)!, element, data: entryOf(element.getAttribute(SORTABLE_ITEM_ATTR)!)?.data }));

  renderer.setAttribute(host, "data-sortable", "");
  renderer.setAttribute(host, "data-orientation", vertical() ? "vertical" : "horizontal");

  const zone: DndZone = {
    id,
    name,
    element: host,
    label: () => options.label?.() ?? "",
    group: () => options.group?.(),
    disabled: options.disabled,
    sortable: { orientation: () => (vertical() ? "vertical" : "horizontal"), items: infos },
    onDrop(source: DragSource, info: DropInfo) {
      const index = info.index ?? 0;
      if (info.fromZoneId === id && info.fromIndex === index) return;
      options.onMove?.({ id: source.id, data: source.data, from: { container: info.fromName ?? null, index: info.fromIndex ?? null }, to: { container: name(), index } });
    },
    onSendOut(source, to) {
      options.onRemove?.({ id: source.id, data: source.data, from: { container: name(), index: source.index ?? null }, to: { container: to.name, index: to.index ?? 0 } });
    },
  };

  const itemOf = (node: EventTarget | null): HTMLElement | null => {
    const el = (node as Element | null)?.closest?.(`[${SORTABLE_ITEM_ATTR}]`) as HTMLElement | null;
    return el && owns(el) ? el : null;
  };
  const sourceFor = (item: HTMLElement): DragSource | null => {
    const itemId = item.getAttribute(SORTABLE_ITEM_ATTR)!;
    const entry = entryOf(itemId);
    if (options.disabled?.() || entry?.disabled || item.getAttribute("aria-disabled") === "true") return null;
    return {
      id: itemId,
      data: entry?.data,
      group: options.group?.(),
      label: entry?.label || item.textContent?.trim() || "item",
      element: item,
      zoneId: id,
      index: elements().indexOf(item),
      onEnd: (result) => {
        if (!keyboard || !result.dropped) return;
        // A keyed re-render may re-insert the node and drop focus: put it back on the moved item.
        setTimeout(() => {
          const moved = Array.from(doc.querySelectorAll<HTMLElement>(`[${SORTABLE_ITEM_ATTR}]`)).find((e) => e.getAttribute(SORTABLE_ITEM_ATTR) === itemId);
          if (moved && doc.activeElement !== moved) moved.focus();
        }, 0);
      },
    };
  };

  const off = [
    manager.registerZone(zone),
    renderer.listen(host, "pointerdown", (e) => {
      const ev = e as PointerEvent;
      const item = itemOf(ev.target);
      if (!item || ev.button !== 0 || ev.isPrimary === false || !dragStartsHere(item, ev.target as Element)) return;
      const source = sourceFor(item);
      if (!source) return;
      keyboard = false;
      manager.beginPointer(source, ev, { overlay: overlayOf(renderer, doc), preview: options.preview?.() });
    }),
    renderer.listen(host, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if ((ev.key !== " " && ev.key !== "Spacebar") || manager.isDragging()) return;
      const item = itemOf(ev.target);
      if (!item || !liftsHere(item, ev.target as Element)) return;
      const source = sourceFor(item);
      if (!source) return;
      ev.preventDefault();
      keyboard = true;
      manager.beginKeyboard(source);
    }),
  ];
  currentScope()?.onDispose(() => off.forEach((f) => f()));

  const roving =
    options.roving === false
      ? null
      : useRovingTabindex<HTMLElement>({ items: elements, orientation: "both", isDisabled: (el) => el.getAttribute("aria-disabled") === "true" }, { renderer: renderer as Renderer<HTMLElement>, host });
  const Observer = doc.defaultView?.MutationObserver;
  if (roving && Observer) {
    const observer = new Observer(() => roving.refresh());
    observer.observe(host, { childList: true, subtree: true });
    currentScope()?.onDispose(() => observer.disconnect());
  }
  return { id: name, refresh: () => roving?.refresh() };
}

/**
 * `<ul [uiSortable]="tasks()" sortableGroup="board" sortableLabel="To do" (moved)="tasks.set(apply($event))">` with
 * `<li [uiSortableItem]="task.id">` rows rendered by `@for`. The input is the items: objects with an `id` (and
 * optionally `label`, `disabled`), or plain strings. `moved` fires on the list the item lands in, `removed` on the list
 * it left (both carry the same `SortableMove`); use `applySortableMove` to update the arrays.
 */
export class UiSortable {
  static meta = { selector: "[uiSortable]" };
  uiSortable = input<readonly unknown[]>([]);
  sortableId = input<string | undefined>(undefined);
  sortableGroup = input<string | undefined>(undefined);
  sortableLabel = input<string | undefined>(undefined);
  sortableOrientation = input<"vertical" | "horizontal">("vertical");
  sortableDisabled = input<boolean>(false);
  moved = output<SortableMove>();
  removed = output<SortableMove>();
  sortable = useSortable({
    items: () =>
      this.uiSortable().map((item) => {
        if (item !== null && typeof item === "object") {
          const o = item as { id?: unknown; label?: unknown; disabled?: unknown };
          return { id: String(o.id), data: item, label: typeof o.label === "string" ? o.label : undefined, disabled: o.disabled === true };
        }
        return { id: String(item), data: item };
      }),
    container: () => this.sortableId(),
    group: () => this.sortableGroup(),
    label: () => this.sortableLabel(),
    orientation: () => this.sortableOrientation(),
    disabled: () => this.sortableDisabled(),
    onMove: (e) => this.moved.emit(e),
    onRemove: (e) => this.removed.emit(e),
  });
}

/** `<li [uiSortableItem]="task.id">`: marks a row of the surrounding `uiSortable` and makes it accessible (role description, keyboard instructions). */
export class UiSortableItem {
  static meta = { selector: "[uiSortableItem]" };
  uiSortableItem = input<string | number>("");
  private _mark = (() => {
    const { renderer, host } = injectHost<HTMLElement>();
    renderer.setAttribute(host, "aria-roledescription", "sortable item");
    renderer.setAttribute(host, "aria-describedby", instructionsId(host.ownerDocument));
    effect(() => renderer.setAttribute(host, SORTABLE_ITEM_ATTR, String(this.uiSortableItem())));
    return true;
  })();
}

export { DRAG_HANDLE_ATTR };
