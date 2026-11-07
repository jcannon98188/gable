import { signal, untracked, type ReadonlySignal } from "@gable/core";

export type ResizeDirection = "horizontal" | "vertical";

/** The constraints of one panel. Sizes are percentages of the group (0 to 100). */
export interface ResizePanelConfig {
  /** Starting size. Panels without one share what the others leave. */
  defaultSize?: number;
  /** Smallest size while expanded. Default 0. */
  minSize?: number;
  /** Largest size. Default 100. */
  maxSize?: number;
  /** The panel can be collapsed (to `collapsedSize`) by dragging past its minimum, or with Enter on a handle. */
  collapsible?: boolean;
  /** The size of a collapsed panel. Default 0. */
  collapsedSize?: number;
}

export interface ResizeEngineOptions {
  direction: () => ResizeDirection;
  /** Percentage of the group one arrow key press moves a handle. Default 10. */
  keyboardStep?: () => number;
  /** True when a horizontal group runs right to left: drags and the arrow keys are mirrored. Default false. */
  rtl?: () => boolean;
  /** Called after every change of the layout. */
  onLayout?(sizes: number[]): void;
}

/** What a separator reports for assistive technology: the primary (before) panel's size and the range it can take. */
export interface ResizeHandleState {
  now: number;
  min: number;
  max: number;
}

interface Norm {
  min: number;
  max: number;
  collapsible: boolean;
  collapsed: number;
}

const EPS = 1e-6;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const round = (n: number) => Math.round(n * 1000) / 1000;

function normalise(c: ResizePanelConfig): Norm {
  const collapsed = c.collapsible ? (c.collapsedSize ?? 0) : 0;
  const min = clamp(c.minSize ?? 0, 0, 100);
  return { min: Math.max(min, collapsed), max: clamp(c.maxSize ?? 100, min, 100), collapsible: !!c.collapsible, collapsed };
}

/** Starting sizes: defaults where given, the rest split equally, scaled to total 100 and kept inside each panel's range. */
export function initialSizes(configs: readonly ResizePanelConfig[]): number[] {
  if (configs.length === 0) return [];
  const given = configs.reduce((sum, c) => sum + (c.defaultSize ?? 0), 0);
  const open = configs.filter((c) => c.defaultSize === undefined).length;
  const share = open > 0 ? Math.max(0, 100 - given) / open : 0;
  let sizes = configs.map((c) => c.defaultSize ?? share);
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total > 0 && Math.abs(total - 100) > EPS) sizes = sizes.map((s) => (s * 100) / total);
  else if (total === 0) sizes = configs.map(() => 100 / configs.length);
  const norms = configs.map(normalise);
  sizes = sizes.map((s, i) => clamp(s, norms[i]!.collapsible ? norms[i]!.collapsed : norms[i]!.min, norms[i]!.max));
  // Clamping can leave a remainder: hand it to the panels that can take it.
  let rest = 100 - sizes.reduce((a, b) => a + b, 0);
  for (let i = sizes.length - 1; i >= 0 && Math.abs(rest) > EPS; i--) {
    const next = clamp(sizes[i]! + rest, norms[i]!.collapsible ? norms[i]!.collapsed : norms[i]!.min, norms[i]!.max);
    rest -= next - sizes[i]!;
    sizes[i] = next;
  }
  return sizes.map(round);
}

/**
 * The logic of a group of resizable panels, with no DOM: panel sizes as percentages that always total 100, and handles
 * between neighbouring panels. Feed it pointer positions (`startDrag`, `dragTo`, `endDrag`) with the group's size in
 * pixels, or keys (`key`); read `sizes()` and `handleState(i)`.
 *
 * - A handle moves its two neighbours within their `minSize`/`maxSize`. When the neighbour in the direction of the drag
 *   is at its minimum, the drag (and an arrow key) carries on into the panel beyond it, as react-resizable-panels does
 *   (Home, End and `resize` with an infinite delta stay with the two neighbours).
 * - A horizontal group in RTL mirrors pointer drags and the arrow keys.
 * - A collapsible panel dragged below its minimum snaps to `collapsedSize` once past the halfway point, and back to its
 *   minimum when dragged out of it again. A collapsed panel remembers its size for `expand`.
 * - Keys follow the ARIA window splitter: arrows along the group's axis move the handle by `keyboardStep`, Home and End
 *   move it as far as the neighbours allow, Enter collapses a collapsible neighbour or expands it again. Keys never
 *   leave a panel between its collapsed size and its minimum.
 */
export class ResizeEngine {
  private configs: ResizePanelConfig[] = [];
  private store = signal<number[]>([]);
  private active = signal(false);
  private remembered = new Map<number, number>();
  private drag: { handle: number; start: number; containerPx: number; base: number[] } | null = null;

  /** The panel sizes, in percent. */
  readonly sizes: ReadonlySignal<number[]> = this.store;
  readonly dragging: ReadonlySignal<boolean> = this.active;

  constructor(private o: ResizeEngineOptions) {}

  /**
   * Sets the panels. The layout starts from `layout` when it is a valid layout for them (right count, totals 100),
   * otherwise from the defaults; when the panels merely change their limits the current sizes are kept and clamped.
   */
  configure(configs: readonly ResizePanelConfig[], layout?: readonly number[] | null): void {
    const prev = this.configs;
    this.configs = [...configs];
    const current = untracked(this.store);
    let next: number[];
    if (layout && ResizeEngine.valid(layout, this.configs.length)) next = [...layout];
    else if (current.length === this.configs.length && prev.length === this.configs.length) next = this.fit(current);
    else next = initialSizes(this.configs);
    this.remembered.clear();
    this.commit(next);
  }

  /** True when `layout` could be a layout of `count` panels: finite, non-negative, totalling 100. */
  static valid(layout: readonly number[], count: number): boolean {
    return layout.length === count && layout.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) && Math.abs(layout.reduce((a, b) => a + b, 0) - 100) < 0.5;
  }

  /** Replaces the sizes (a restored layout). Ignored when it does not fit the panels. */
  setSizes(layout: readonly number[]): void {
    if (ResizeEngine.valid(layout, this.configs.length)) this.commit([...layout]);
  }

  private fit(sizes: number[]): number[] {
    const norms = this.configs.map(normalise);
    const out = sizes.map((s, i) => clamp(s, norms[i]!.collapsible ? norms[i]!.collapsed : norms[i]!.min, norms[i]!.max));
    return ResizeEngine.valid(out, out.length) ? out : initialSizes(this.configs);
  }

  private commit(next: number[]): void {
    const prev = untracked(this.store);
    if (prev.length === next.length && prev.every((n, i) => Math.abs(n - next[i]!) < EPS)) return;
    this.store.set(next);
    this.o.onLayout?.(next);
  }

  isCollapsed(panel: number): boolean {
    const n = this.configs[panel] ? normalise(this.configs[panel]!) : null;
    const size = this.store()[panel];
    return !!n && n.collapsible && size !== undefined && size <= n.collapsed + EPS;
  }

  /** Bounds of the handle's primary (before) panel given its neighbour. */
  private bounds(handle: number, snap: boolean, base: readonly number[]): { lo: number; hi: number; total: number; l: Norm; r: Norm } | null {
    const lc = this.configs[handle];
    const rc = this.configs[handle + 1];
    if (!lc || !rc || base.length !== this.configs.length) return null;
    const l = normalise(lc);
    const r = normalise(rc);
    const total = base[handle]! + base[handle + 1]!;
    const floor = (n: Norm, size: number) => (n.collapsible && (snap || size <= n.collapsed + EPS) ? n.collapsed : n.min);
    const lo = Math.max(floor(l, base[handle]!), total - r.max);
    const hi = Math.min(l.max, total - floor(r, base[handle + 1]!));
    return { lo, hi, total, l, r };
  }

  /** Moves a handle by `delta` percent from `base` (the layout when the gesture began). */
  private move(handle: number, base: readonly number[], delta: number, snap: boolean, cascade = false): void {
    const b = this.bounds(handle, snap, base);
    if (!b) return;
    const { lo, hi, total, l, r } = b;
    if (lo > hi + EPS) return;
    const target = clamp(base[handle]! + delta, lo, hi);
    let left = target;
    const inRange = (n: number) => n >= lo - EPS && n <= hi + EPS;
    const snapTo = (n: Norm, size: number) => (size < n.min - EPS ? (snap ? (size < (n.collapsed + n.min) / 2 ? n.collapsed : n.min) : size <= n.collapsed + EPS ? (delta > 0 ? n.min : n.collapsed) : n.min) : size);
    if (l.collapsible && left < l.min - EPS) {
      const c = snapTo(l, left);
      if (inRange(c)) left = c;
    }
    if (r.collapsible && total - left < r.min - EPS) {
      const c = total - snapTo(r, total - left);
      if (inRange(c)) left = c;
    }
    const next = [...base];
    next[handle] = round(left);
    next[handle + 1] = round(total - left);
    const rest = base[handle]! + delta - target;
    if (cascade && Number.isFinite(delta) && Math.abs(rest) > EPS && left === target) this.cascade(next, handle, rest, l, r);
    this.commit(next);
  }

  /**
   * The drag asked for `rest` percent more than the two neighbours could give. Positive: the panel before the handle grows
   * and the panels after its neighbour shrink in turn (down to their minimums); negative: the mirror image.
   */
  private cascade(next: number[], handle: number, rest: number, l: Norm, r: Norm): void {
    const grow = rest > 0 ? handle : handle + 1;
    const room = (rest > 0 ? l.max : r.max) - next[grow]!;
    const order: number[] = [];
    if (rest > 0) for (let k = handle + 2; k < next.length; k++) order.push(k);
    else for (let k = handle - 1; k >= 0; k--) order.push(k);
    const avail = (k: number) => Math.max(0, next[k]! - normalise(this.configs[k]!).min);
    let take = Math.min(Math.abs(rest), Math.max(0, room), order.reduce((sum, k) => sum + avail(k), 0));
    if (take <= EPS) return;
    next[grow] = round(next[grow]! + take);
    for (const k of order) {
      const part = Math.min(take, avail(k));
      next[k] = round(next[k]! - part);
      take -= part;
      if (take <= EPS) break;
    }
  }

  /** Starts a pointer drag of a handle at pointer position `pos` (client x for horizontal groups, y for vertical), in a group `containerPx` pixels long. */
  startDrag(handle: number, pos: number, containerPx: number): void {
    this.drag = { handle, start: pos, containerPx, base: [...untracked(this.store)] };
    this.active.set(true);
  }

  dragTo(pos: number): void {
    const d = this.drag;
    if (!d || d.containerPx <= 0) return;
    const sign = this.mirrored() ? -1 : 1;
    this.move(d.handle, d.base, (sign * ((pos - d.start) / d.containerPx)) * 100, true, true);
  }

  endDrag(): void {
    this.drag = null;
    this.active.set(false);
  }

  private mirrored(): boolean {
    return this.o.direction() === "horizontal" && !!this.o.rtl?.();
  }

  /** Moves a handle by a percentage, without snapping to collapse. */
  resize(handle: number, delta: number): void {
    this.move(handle, untracked(this.store), delta, false, true);
  }

  /** Sets one panel's size, taking from or giving to its neighbour (the next panel, or the previous one for the last). */
  setPanelSize(panel: number, size: number): void {
    const handle = panel + 1 < this.configs.length ? panel : panel - 1;
    if (handle < 0) return;
    const base = untracked(this.store);
    const b = this.bounds(handle, true, base);
    if (!b) return;
    const left = handle === panel ? size : b.total - size;
    this.move(handle, base, left - base[handle]!, true);
  }

  collapse(panel: number): void {
    const n = this.configs[panel] ? normalise(this.configs[panel]!) : null;
    if (!n?.collapsible || this.isCollapsed(panel)) return;
    this.remembered.set(panel, untracked(this.store)[panel]!);
    this.setPanelSize(panel, n.collapsed);
  }

  expand(panel: number): void {
    if (!this.isCollapsed(panel)) return;
    const n = normalise(this.configs[panel]!);
    this.setPanelSize(panel, Math.max(n.min, this.remembered.get(panel) ?? n.min));
    this.remembered.delete(panel);
  }

  /** The values a separator reports: the primary panel's size and the range it can take. */
  handleState(handle: number): ResizeHandleState {
    const base = this.store();
    const b = this.bounds(handle, true, base);
    const now = base[handle] ?? 0;
    return b ? { now: Math.round(now), min: Math.round(Math.min(b.lo, now)), max: Math.round(Math.max(b.hi, now)) } : { now: Math.round(now), min: 0, max: 100 };
  }

  /** Handles a key on a handle; returns true when the key is one the splitter uses (so the caller prevents default). */
  key(handle: number, key: string): boolean {
    const horizontal = this.o.direction() === "horizontal";
    const mirrored = this.mirrored();
    const step = this.o.keyboardStep?.() ?? 10;
    const base = untracked(this.store);
    if (handle < 0 || handle + 1 >= base.length) return false;
    switch (key) {
      case horizontal ? (mirrored ? "ArrowRight" : "ArrowLeft") : "ArrowUp":
        this.resize(handle, -step);
        return true;
      case horizontal ? (mirrored ? "ArrowLeft" : "ArrowRight") : "ArrowDown":
        this.resize(handle, step);
        return true;
      case "Home":
        this.resize(handle, -Infinity);
        return true;
      case "End":
        this.resize(handle, Infinity);
        return true;
      case "Enter": {
        const target = [handle, handle + 1].find((p) => this.isCollapsed(p)) ?? [handle, handle + 1].find((p) => normalise(this.configs[p] ?? {}).collapsible);
        if (target === undefined) return false;
        if (this.isCollapsed(target)) this.expand(target);
        else this.collapse(target);
        return true;
      }
      default:
        return false;
    }
  }
}
