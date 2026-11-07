import { signal, type ReadonlySignal } from "@gable/core";
import { announce, dndMessages, type DndPosition } from "./dnd-announce.js";

/**
 * The drag and drop session engine shared by `uiDraggable`, `uiDropZone` and `uiSortable`. One manager per document.
 * It is DOM only (pointer events, `getBoundingClientRect`, `getComputedStyle`).
 *
 * A *source* is whatever is being dragged; a *zone* is where it can land. Plain drop zones just say "dropped here";
 * sortable zones also have items, so the target is a zone plus an insertion `index` (the item's final position in the
 * list, counted without the dragged item). Pointer and keyboard sessions share the same target model.
 */

export interface DragResult {
  dropped: boolean;
  zoneId?: string;
  index?: number;
}

export interface DragSource {
  /** Unique among everything draggable in the document (for sortables, the item id). */
  id: string;
  data: unknown;
  /** Only zones with the same group (or no group on either side) accept it. */
  group?: string;
  /** Spoken in announcements. */
  label: string;
  element: HTMLElement;
  /** For a sortable item: the zone it comes from and its index there. */
  zoneId?: string;
  index?: number;
  onStart?(): void;
  onEnd?(result: DragResult): void;
}

export interface SortableItemInfo {
  id: string;
  element: HTMLElement;
  data?: unknown;
}

export interface SortableAdapter {
  orientation(): "vertical" | "horizontal";
  /** The items in DOM order, the dragged one included. */
  items(): SortableItemInfo[];
}

export interface DropInfo {
  /** Final index in the zone's list (sortable zones only). */
  index?: number;
  /** The zone the source started in, when it was a sortable item. */
  fromZoneId?: string;
  /** Public name of that zone (`DndZone.name`, default its id). */
  fromName?: string;
  fromIndex?: number;
}

export interface DndZone {
  id: string;
  /** Name reported in drop events; default `id`. */
  name?(): string;
  element: HTMLElement;
  /** Spoken in announcements. */
  label(): string;
  group(): string | undefined;
  disabled?(): boolean;
  /** Extra acceptance test on top of the group check. */
  accepts?(source: DragSource): boolean;
  sortable?: SortableAdapter;
  onEnter?(source: DragSource): void;
  onLeave?(source: DragSource): void;
  /** The source was dropped on this zone. */
  onDrop(source: DragSource, info: DropInfo): void;
  /** The source started in this (sortable) zone and was dropped in another one. */
  onSendOut?(source: DragSource, to: { zoneId: string; name: string; index?: number }): void;
}

export interface DropTarget {
  zone: DndZone;
  index?: number;
}

export interface ActiveDrag {
  sourceId: string;
  mode: "pointer" | "keyboard";
  overZoneId: string | null;
  overIndex: number | null;
}

export interface PointerDragOptions {
  /** Where the preview goes: the renderer's overlay root (what `<ui-portal>` uses). */
  overlay?: Element;
  /** Pixels the pointer must move before a drag starts. Default 4. */
  threshold?: number;
  /** `"clone"` (default), `"none"`, or a function returning the element to show. The manager positions it. */
  preview?: "clone" | "none" | ((source: DragSource) => HTMLElement | null);
}

interface Session {
  source: DragSource;
  mode: "pointer" | "keyboard";
  target: DropTarget | null;
  preview: HTMLElement | null;
  offset: { x: number; y: number };
  point: { x: number; y: number };
  cleanup: Array<() => void>;
  painted: Element[];
  raf: number | null;
}

/** Pixels per frame to scroll a container when the pointer is within `edge` px of its sides. Pure, for tests and custom scrollers. */
export function autoScrollDelta(rect: { left: number; top: number; right: number; bottom: number }, point: { x: number; y: number }, edge = 48, maxSpeed = 18): { dx: number; dy: number } {
  const axis = (pos: number, lo: number, hi: number) => {
    if (pos < lo) return -maxSpeed; // beyond the edge: keep scrolling at full speed
    if (pos > hi) return maxSpeed;
    if (pos < lo + edge) return -Math.ceil(maxSpeed * ((lo + edge - pos) / edge));
    if (pos > hi - edge) return Math.ceil(maxSpeed * ((pos - (hi - edge)) / edge));
    return 0;
  };
  return { dx: axis(point.x, rect.left, rect.right), dy: axis(point.y, rect.top, rect.bottom) };
}

const nameOf = (z: DndZone) => z.name?.() ?? z.id;
const managers = new WeakMap<Document, DndManager>();
export function getDndManager(doc: Document): DndManager {
  let m = managers.get(doc);
  if (!m) managers.set(doc, (m = new DndManager(doc)));
  return m;
}

/** Pixels past the end of a sortable list that still count as dropping at its end. */
const END_SLACK = 48;

export class DndManager {
  private zones = new Map<string, DndZone>();
  private session: Session | null = null;
  private _active = signal<ActiveDrag | null>(null);
  /** The drag in progress, or null. Read it to style the UI or to know that a drag is running. */
  readonly active: ReadonlySignal<ActiveDrag | null> = this._active;
  private win: Window;

  constructor(readonly doc: Document) {
    this.win = doc.defaultView as Window;
  }

  registerZone(zone: DndZone): () => void {
    this.zones.set(zone.id, zone);
    return () => {
      if (this.zones.get(zone.id) === zone) this.zones.delete(zone.id);
      if (this.session?.target?.zone === zone) this.setTarget(null, false);
    };
  }

  isDragging(): boolean {
    return this.session !== null;
  }

  /** Whether `zone` can take `source` right now. */
  accepts(zone: DndZone, source: DragSource): boolean {
    if (zone.disabled?.()) return false;
    const g = zone.group();
    if ((g !== undefined || source.group !== undefined) && g !== source.group) return false;
    return zone.accepts ? zone.accepts(source) : true;
  }

  // ---- pointer ----

  /** Call from `pointerdown` on a source. The drag starts after the pointer moved `threshold` px, and ends on pointerup. */
  beginPointer(source: DragSource, event: PointerEvent, options: PointerDragOptions = {}): void {
    if (this.session) return;
    const doc = this.doc;
    const threshold = options.threshold ?? 4;
    const start = { x: event.clientX, y: event.clientY };
    const id = event.pointerId;
    let started = false;
    const off: Array<() => void> = [];
    const on = (t: EventTarget, type: string, fn: (e: any) => void, capture = false) => {
      t.addEventListener(type, fn, capture);
      off.push(() => t.removeEventListener(type, fn, capture));
    };
    const stop = () => off.splice(0).forEach((f) => f());

    on(doc, "pointermove", (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (!started) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < threshold) return;
        started = true;
        this.activate(source, "pointer", start, options);
      }
      this.move(e.clientX, e.clientY);
      e.preventDefault();
    });
    const finish = (cancel: boolean) => (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if (started) this.end(cancel);
      stop();
    };
    on(doc, "pointerup", finish(false));
    on(doc, "pointercancel", finish(true));
    on(doc, "keydown", (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (started) {
        e.preventDefault();
        this.end(true);
      }
      stop();
    });
    on(doc, "selectstart", (e: Event) => started && e.preventDefault());
    on(doc, "dragstart", (e: Event) => e.preventDefault(), true);
  }

  // ---- keyboard ----

  /** Lifts `source` for keyboard operation: arrows move the target, space drops, escape cancels. */
  beginKeyboard(source: DragSource): void {
    if (this.session) return;
    const rect = source.element.getBoundingClientRect();
    this.activate(source, "keyboard", { x: rect.left, y: rect.top }, {});
    const s = this.session!;
    const home = source.zoneId ? this.zones.get(source.zoneId) : undefined;
    if (home?.sortable) this.setTarget({ zone: home, index: source.index ?? 0 }, false);
    this.say(dndMessages().lift(this.position(s, s.target)));
    const onKey = (e: KeyboardEvent) => {
      if (!this.session) return;
      const k = e.key;
      if (k === " " || k === "Spacebar") this.end(false);
      else if (k === "Escape") this.end(true);
      else if (k === "Tab") return this.end(true); // focus moves on; do not swallow Tab
      else if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") this.arrow(k);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    this.doc.addEventListener("keydown", onKey, true);
    s.cleanup.push(() => this.doc.removeEventListener("keydown", onKey, true));
  }

  // ---- shared ----

  private activate(source: DragSource, mode: "pointer" | "keyboard", point: { x: number; y: number }, options: PointerDragOptions): void {
    const rect = source.element.getBoundingClientRect();
    const s: Session = { source, mode, target: null, preview: null, offset: { x: point.x - rect.left, y: point.y - rect.top }, point: { ...point }, cleanup: [], painted: [], raf: null };
    this.session = s;
    source.element.setAttribute("data-dragging", mode);
    this.doc.documentElement.setAttribute("data-dnd-active", mode);
    s.cleanup.push(() => {
      source.element.removeAttribute("data-dragging");
      this.doc.documentElement.removeAttribute("data-dnd-active");
    });
    if (mode === "pointer") {
      s.preview = this.makePreview(source, rect, options);
      if (s.preview) {
        const preview = s.preview;
        s.cleanup.push(() => preview.remove());
        (options.overlay ?? this.doc.body).append(preview);
        this.placePreview(s);
      }
      // The click that follows pointerup on the source is not a click.
      const swallow = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      this.doc.addEventListener("click", swallow, true);
      s.cleanup.push(() => void this.win.setTimeout(() => this.doc.removeEventListener("click", swallow, true), 0));
      this.say(dndMessages().lift(this.position(s, null)));
    }
    source.onStart?.();
    this.publish();
  }

  private makePreview(source: DragSource, rect: DOMRect, options: PointerDragOptions): HTMLElement | null {
    const mode = options.preview ?? "clone";
    if (mode === "none") return null;
    let el: HTMLElement;
    if (typeof mode === "function") {
      const custom = mode(source);
      if (!custom) return null;
      el = custom;
    } else {
      el = source.element.cloneNode(true) as HTMLElement;
      el.removeAttribute("id");
      el.removeAttribute("data-dragging");
      el.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    }
    el.setAttribute("data-dnd-preview", "");
    el.setAttribute("aria-hidden", "true");
    el.removeAttribute("tabindex");
    Object.assign(el.style, { position: "fixed", left: "0px", top: "0px", margin: "0", pointerEvents: "none", zIndex: "2147483647", boxSizing: "border-box" });
    return el;
  }

  private placePreview(s: Session): void {
    if (s.preview) s.preview.style.transform = `translate3d(${s.point.x - s.offset.x}px, ${s.point.y - s.offset.y}px, 0)`;
  }

  private move(x: number, y: number): void {
    const s = this.session;
    if (!s) return;
    s.point = { x, y };
    this.placePreview(s);
    this.hitTest();
    this.scheduleScroll();
  }

  /** Recomputes the target from the pointer position (rect based, so it needs no `elementFromPoint`). */
  private hitTest(): void {
    const s = this.session;
    if (!s || s.mode !== "pointer") return;
    const { x, y } = s.point;
    const hits: DndZone[] = [];
    const near: DndZone[] = [];
    for (const zone of this.zones.values()) {
      if (!this.accepts(zone, s.source)) continue;
      const r = zone.element.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hits.push(zone);
      else if (zone.sortable) {
        // A list ends at its last row, so dropping "at the end" means releasing just past it: allow some slack there.
        const v = zone.sortable.orientation() === "vertical";
        if (v ? x >= r.left && x <= r.right && y > r.bottom && y <= r.bottom + END_SLACK : y >= r.top && y <= r.bottom && x > r.right && x <= r.right + END_SLACK) near.push(zone);
      }
    }
    if (!hits.length) hits.push(...near);
    // The innermost zone wins: drop any zone that contains another hit.
    const zone = hits.filter((z) => !hits.some((o) => o !== z && z.element.contains(o.element)))[0];
    this.setTarget(zone ? { zone, index: zone.sortable ? this.indexAt(zone, s.source, x, y) : undefined } : null, false);
  }

  private others(zone: DndZone, source: DragSource): SortableItemInfo[] {
    return zone.sortable ? zone.sortable.items().filter((i) => i.id !== source.id) : [];
  }

  private indexAt(zone: DndZone, source: DragSource, x: number, y: number): number {
    const vertical = zone.sortable!.orientation() === "vertical";
    let n = 0;
    for (const item of this.others(zone, source)) {
      const r = item.element.getBoundingClientRect();
      const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      if ((vertical ? y : x) > mid) n++;
      else break;
    }
    return n;
  }

  private setTarget(next: DropTarget | null, speak: boolean): void {
    const s = this.session;
    if (!s) return;
    const prev = s.target;
    if (prev?.zone === next?.zone && prev?.index === next?.index) return;
    if (prev?.zone !== next?.zone) {
      prev?.zone.onLeave?.(s.source);
      next?.zone.onEnter?.(s.source);
    }
    s.target = next;
    this.paint(s);
    this.publish();
    if (speak) this.say(next ? dndMessages().over(this.position(s, next)) : dndMessages().noTarget(this.position(s, null)));
  }

  private unpaint(s: Session): void {
    for (const el of s.painted) {
      el.removeAttribute("data-drop-over");
      el.removeAttribute("data-drop-position");
    }
    s.painted = [];
  }

  private paint(s: Session): void {
    this.unpaint(s);
    const t = s.target;
    if (!t) return;
    t.zone.element.setAttribute("data-drop-over", "");
    s.painted.push(t.zone.element);
    if (t.zone.sortable && t.index !== undefined) {
      const rest = this.others(t.zone, s.source);
      const ref = rest[t.index] ?? rest[rest.length - 1];
      if (ref) {
        ref.element.setAttribute("data-drop-position", rest[t.index] ? "before" : "after");
        s.painted.push(ref.element);
      }
    }
  }

  private publish(): void {
    const s = this.session;
    this._active.set(s ? { sourceId: s.source.id, mode: s.mode, overZoneId: s.target?.zone.id ?? null, overIndex: s.target?.index ?? null } : null);
  }

  private position(s: Session, t: DropTarget | null): DndPosition {
    const zone = t?.zone.label();
    if (t?.zone.sortable && t.index !== undefined) return { label: s.source.label, position: t.index + 1, total: this.others(t.zone, s.source).length + 1, zone };
    if (!t && s.source.zoneId) {
      const home = this.zones.get(s.source.zoneId);
      if (home?.sortable) return { label: s.source.label, position: (s.source.index ?? 0) + 1, total: home.sortable.items().length, zone: home.label() };
    }
    return { label: s.source.label, zone };
  }

  private say(text: string): void {
    announce(this.doc, text);
  }

  private end(cancel: boolean): void {
    const s = this.session;
    if (!s) return;
    this.session = null;
    if (s.raf !== null) this.win.cancelAnimationFrame(s.raf);
    const target = cancel ? null : s.target;
    const result: DragResult = target ? { dropped: true, zoneId: target.zone.id, index: target.index } : { dropped: false };
    const spoken = this.position(s, target);
    const home = s.source.zoneId ? this.zones.get(s.source.zoneId) : undefined;
    this.unpaint(s);
    s.target?.zone.onLeave?.(s.source);
    s.cleanup.forEach((f) => f());
    this._active.set(null);
    if (target) {
      if (home && home !== target.zone) home.onSendOut?.(s.source, { zoneId: target.zone.id, name: nameOf(target.zone), index: target.index });
      target.zone.onDrop(s.source, { index: target.index, fromZoneId: s.source.zoneId, fromName: home ? nameOf(home) : undefined, fromIndex: s.source.index });
      this.say(dndMessages().drop(spoken));
    } else {
      this.say(dndMessages().cancel(this.position(s, null)));
    }
    s.source.onEnd?.(result);
  }

  /** Cancels a drag in progress (also what Escape does). */
  cancel(): void {
    this.end(true);
  }

  // ---- keyboard targets ----

  private arrow(key: string): void {
    const s = this.session!;
    const t = s.target;
    const step = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    if (t?.zone.sortable && t.index !== undefined) {
      const zone = t.zone;
      const vertical = zone.sortable!.orientation() === "vertical";
      const along = vertical ? key === "ArrowUp" || key === "ArrowDown" : key === "ArrowLeft" || key === "ArrowRight";
      if (along) {
        const max = this.others(zone, s.source).length;
        const index = Math.max(0, Math.min(max, t.index + step));
        this.setTarget({ zone, index }, index !== t.index);
        this.reveal(s);
        return;
      }
      const next = this.neighbour(zone, s.source, step);
      if (next) {
        this.setTarget({ zone: next, index: next.sortable ? Math.min(t.index, this.others(next, s.source).length) : undefined }, true);
        this.reveal(s);
      }
      return;
    }
    const next = this.neighbour(t?.zone ?? null, s.source, step);
    if (next) {
      this.setTarget({ zone: next, index: next.sortable ? this.others(next, s.source).length : undefined }, true);
      this.reveal(s);
    }
  }

  private reveal(s: Session): void {
    const t = s.target;
    if (!t) return;
    const rest = t.index !== undefined ? this.others(t.zone, s.source) : [];
    const el = rest[t.index ?? 0]?.element ?? rest[rest.length - 1]?.element ?? t.zone.element;
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  /** The accepting zone before (-1) or after (+1) `from` in document order; with no `from`, the first or last. */
  private neighbour(from: DndZone | null, source: DragSource, step: 1 | -1): DndZone | undefined {
    const list = [...this.zones.values()]
      .filter((z) => this.accepts(z, source) && z.element.isConnected)
      .sort((a, b) => (a.element.compareDocumentPosition(b.element) & 4 ? -1 : 1));
    if (!from) return step === 1 ? list[0] : list[list.length - 1];
    return list[list.indexOf(from) + step];
  }

  // ---- auto scroll ----

  private scheduleScroll(): void {
    const s = this.session;
    if (!s || s.mode !== "pointer" || s.raf !== null) return;
    const loop = () => {
      const cur = this.session;
      if (!cur) return;
      this.autoScrollTick();
      cur.raf = this.win.requestAnimationFrame(loop);
    };
    s.raf = this.win.requestAnimationFrame(loop);
  }

  /**
   * One auto-scroll step for the current pointer position: scrolls the nearest scrollable ancestor of the zone under
   * the pointer (or of the dragged element) when the pointer is near its edge, then re-tests the target. Called every
   * animation frame during a pointer drag; public so tests can drive it. Returns whether anything scrolled.
   */
  autoScrollTick(): boolean {
    const s = this.session;
    if (!s) return false;
    const start = s.target?.zone.element ?? s.source.element;
    for (let el: HTMLElement | null = start; el; el = el.parentElement) {
      if (el === this.doc.documentElement || el === this.doc.body || !this.scrollable(el)) continue;
      const { dx, dy } = autoScrollDelta(el.getBoundingClientRect(), s.point);
      if ((dx !== 0 || dy !== 0) && this.scrollBy(el, dx, dy)) {
        this.hitTest();
        return true;
      }
    }
    const view = { left: 0, top: 0, right: this.win.innerWidth, bottom: this.win.innerHeight };
    const { dx, dy } = autoScrollDelta(view, s.point);
    const root = (this.doc.scrollingElement ?? this.doc.documentElement) as HTMLElement;
    if ((dx !== 0 || dy !== 0) && this.scrollBy(root, dx, dy)) {
      this.hitTest();
      return true;
    }
    return false;
  }

  private scrollable(el: HTMLElement): boolean {
    const style = this.win.getComputedStyle(el);
    const y = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
    const x = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
    return x || y;
  }

  private scrollBy(el: HTMLElement, dx: number, dy: number): boolean {
    const before = { x: el.scrollLeft, y: el.scrollTop };
    el.scrollLeft += dx;
    el.scrollTop += dy;
    return el.scrollLeft !== before.x || el.scrollTop !== before.y;
  }
}
