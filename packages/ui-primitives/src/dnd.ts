import { input, output, signal, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";
import { instructionsId } from "./dnd-announce.js";
import { getDndManager, type DragResult, type DragSource, type DndZone, type DropInfo, type PointerDragOptions } from "./dnd-manager.js";
import { uniqueId } from "./id.js";

type Target = { renderer: Renderer<any>; host: any };

const INTERACTIVE = 'input,textarea,select,button,a[href],[contenteditable=""],[contenteditable="true"]';
/** Attribute that marks a drag handle (see `UiDragHandle`). */
export const DRAG_HANDLE_ATTR = "data-drag-handle";

/** Options for `useDraggable`. Every value that can change is a getter so it may read signals. */
export interface DraggableOptions {
  /** What the drop target receives. */
  data: () => unknown;
  /** Only drop zones with the same group accept it (no group matches only ungrouped zones). */
  group?: () => string | undefined;
  /** Spoken in announcements. Default: the element's text. */
  label?: () => string | undefined;
  disabled?: () => boolean;
  preview?: () => PointerDragOptions["preview"];
  threshold?: number;
  onStart?: () => void;
  onEnd?: (result: DragResult) => void;
}

/** What `useDraggable` returns: `dragging` is true from the moment the drag starts until it ends. */
export interface DraggableHandle {
  readonly dragging: ReadonlySignal<boolean>;
}

/** The overlay root of the renderer (what `<ui-portal>` uses), falling back to `document.body`. */
export function overlayOf(renderer: Renderer<any>, doc: Document): Element {
  return (renderer.overlayRoot?.() as Element | undefined) ?? doc.body;
}

/** Whether a pointer press on `node` starts a drag: on a handle if the host has any, otherwise anywhere but nested controls. */
export function dragStartsHere(host: HTMLElement, node: Element | null): boolean {
  if (!node) return false;
  const handle = node.closest(`[${DRAG_HANDLE_ATTR}]`);
  if (handle && host.contains(handle)) return true;
  if (host.querySelector(`[${DRAG_HANDLE_ATTR}]`)) return false;
  const interactive = node.closest(INTERACTIVE);
  return !(interactive && host.contains(interactive) && interactive !== host);
}

/** Whether a key press on `node` may lift the item: the host itself or one of its handles (not a nested input). */
export function liftsHere(host: HTMLElement, node: Element | null): boolean {
  if (!node) return false;
  if (node === host) return true;
  const handle = node.closest(`[${DRAG_HANDLE_ATTR}]`);
  return !!handle && host.contains(handle);
}

/**
 * Makes the host draggable with the pointer (after 4px of movement; the preview is a clone in the overlay root) and the
 * keyboard (focus the host or its handle, space lifts; arrows choose a drop zone, space drops, escape cancels). If the
 * host contains `[data-drag-handle]` elements, only they start a pointer drag. Needs a DOM renderer. Call during Setup.
 */
export function useDraggable(options: DraggableOptions, target: Target = injectHost<HTMLElement>()): DraggableHandle {
  const { renderer, host } = target as { renderer: Renderer<HTMLElement>; host: HTMLElement };
  const doc = host.ownerDocument;
  const manager = getDndManager(doc);
  const dragging = signal(false);
  const id = uniqueId("drag");
  const source = (): DragSource => ({
    id,
    data: options.data(),
    group: options.group?.(),
    label: options.label?.() || host.textContent?.trim() || "item",
    element: host,
    onStart: () => {
      dragging.set(true);
      options.onStart?.();
    },
    onEnd: (r) => {
      dragging.set(false);
      options.onEnd?.(r);
    },
  });
  if (!host.hasAttribute("tabindex")) renderer.setAttribute(host, "tabindex", "0");
  renderer.setAttribute(host, "aria-roledescription", "draggable");
  renderer.setAttribute(host, "aria-describedby", instructionsId(doc));
  renderer.setStyle(host, "touch-action", "none");
  const off = [
    renderer.listen(host, "pointerdown", (e) => {
      const ev = e as PointerEvent;
      if (options.disabled?.() || ev.button !== 0 || ev.isPrimary === false || !dragStartsHere(host, ev.target as Element)) return;
      manager.beginPointer(source(), ev, { overlay: overlayOf(renderer, doc), preview: options.preview?.(), threshold: options.threshold });
    }),
    renderer.listen(host, "keydown", (e) => {
      const ev = e as KeyboardEvent;
      if ((ev.key !== " " && ev.key !== "Spacebar") || options.disabled?.() || manager.isDragging() || !liftsHere(host, ev.target as Element)) return;
      ev.preventDefault();
      manager.beginKeyboard(source());
    }),
  ];
  currentScope()?.onDispose(() => off.forEach((f) => f()));
  return { dragging };
}

/**
 * `<div [uiDraggable]="task" dragGroup="tasks" dragLabel="Write docs" (dragEnded)="...">`: draggable host. The input is the
 * data handed to the drop zone. Add `uiDragHandle` to a child to drag only by that child. Style `[data-dragging]` (the
 * element left behind) and `[data-dnd-preview]` (the clone that follows the pointer).
 */
export class UiDraggable {
  static meta = { selector: "[uiDraggable]" };
  uiDraggable = input<unknown>(null);
  dragGroup = input<string | undefined>(undefined);
  dragLabel = input<string | undefined>(undefined);
  dragDisabled = input<boolean>(false);
  dragPreview = input<"clone" | "none">("clone");
  dragStarted = output();
  dragEnded = output<DragResult>();
  handle = useDraggable({
    data: () => this.uiDraggable(),
    group: () => this.dragGroup(),
    label: () => this.dragLabel(),
    disabled: () => this.dragDisabled(),
    preview: () => this.dragPreview(),
    onStart: () => this.dragStarted.emit(),
    onEnd: (r) => this.dragEnded.emit(r),
  });
}

/** Marks an element inside a draggable or sortable item as its drag handle; it also gets `touch-action: none`. */
export class UiDragHandle {
  static meta = { selector: "[uiDragHandle]" };
  private _mark = (() => {
    const { renderer, host } = injectHost<HTMLElement>();
    renderer.setAttribute(host, DRAG_HANDLE_ATTR, "");
    renderer.setStyle(host, "touch-action", "none");
    return true;
  })();
}

/** What a drop zone receives when something is dropped on it: the dragged `data`. */
export interface DropEvent<T = unknown> {
  data: T;
  /** The zone the dragged item came from, when it was a sortable item. */
  fromZoneId?: string;
}

/** Options for `useDropZone`. `onDrop` is required; everything else narrows or observes the zone. */
export interface DropZoneOptions {
  /** Spoken in announcements. */
  label?: () => string | undefined;
  group?: () => string | undefined;
  disabled?: () => boolean;
  accepts?: (source: DragSource) => boolean;
  onEnter?: (source: DragSource) => void;
  onLeave?: (source: DragSource) => void;
  onDrop: (event: DropEvent, source: DragSource, info: DropInfo) => void;
}

/** What `useDropZone` returns: the zone's id and a signal that is true while an accepted item is over it. */
export interface DropZoneHandle {
  readonly id: string;
  /** True while an accepted item is over the zone. */
  readonly over: ReadonlySignal<boolean>;
}

/** Registers the host as a drop zone. While an accepted item is over it, the host has `data-drop-over`. */
export function useDropZone(options: DropZoneOptions, target: Target = injectHost<HTMLElement>()): DropZoneHandle {
  const { host } = target as { renderer: Renderer<HTMLElement>; host: HTMLElement };
  const manager = getDndManager(host.ownerDocument);
  const id = uniqueId("zone");
  const over = signal(false);
  const zone: DndZone = {
    id,
    element: host,
    label: () => options.label?.() ?? "",
    group: () => options.group?.(),
    disabled: options.disabled,
    accepts: options.accepts,
    onEnter: (s) => {
      over.set(true);
      options.onEnter?.(s);
    },
    onLeave: (s) => {
      over.set(false);
      options.onLeave?.(s);
    },
    onDrop: (s, info) => options.onDrop({ data: s.data, fromZoneId: info.fromZoneId }, s, info),
  };
  currentScope()?.onDispose(manager.registerZone(zone));
  return { id, over };
}

/**
 * `<div uiDropZone dropGroup="tasks" dropLabel="Trash" (dropped)="remove($event.data)">`: a place items can be dropped.
 * `dropAccept` is an optional predicate on the dragged data.
 */
export class UiDropZone {
  static meta = { selector: "[uiDropZone]" };
  dropGroup = input<string | undefined>(undefined);
  dropLabel = input<string | undefined>(undefined);
  dropDisabled = input<boolean>(false);
  dropAccept = input<((data: unknown) => boolean) | undefined>(undefined);
  dropped = output<DropEvent>();
  zone = useDropZone({
    label: () => this.dropLabel(),
    group: () => this.dropGroup(),
    disabled: () => this.dropDisabled(),
    accepts: (s) => this.dropAccept()?.(s.data) ?? true,
    onDrop: (e) => this.dropped.emit(e),
  });
}
