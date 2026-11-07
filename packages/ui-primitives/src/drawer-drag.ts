import { effect, input, output, signal, untracked, type ReadonlySignal } from "@gable/core";
import { currentScope, injectHost } from "@gable/core/internal";
import type { Renderer } from "@gable/core/renderer";

/** The screen edge a drawer is attached to. It decides the drag axis and which direction closes the panel. */
export type DrawerSide = "top" | "right" | "bottom" | "left";

/** One pointer sample: client coordinates and a timestamp in ms. */
export interface DrawerPoint {
  x: number;
  y: number;
  time: number;
}

/** Options for `DrawerDragEngine`: the geometry (`side`, `size`, `snapPoints`), the gesture thresholds and the callbacks that report the outcome. */
export interface DrawerDragEngineOptions {
  side: () => DrawerSide;
  /** The panel's extent along the drag axis, in px (height for top/bottom, width for left/right). */
  size: () => number;
  /** Visible fractions of the panel it can rest at, e.g. `[0.4, 1]`. Default `[1]`. Dragging below the lowest one dismisses. */
  snapPoints?: () => readonly number[];
  /** Fling speed in px/ms that decides the outcome regardless of distance. Default 0.4. */
  velocityThreshold?: number;
  /** The fraction of the lowest snap point dragged away that dismisses the panel. Default 0.5. */
  dismissThreshold?: number;
  /** Pointer travel in px before a press becomes a drag. Default 4. */
  slop?: number;
  /** Called on every change of the panel's position: `offset` px moved toward the closing edge (0 = fully visible). */
  onMove(offset: number, dragging: boolean): void;
  onSnap?(fraction: number): void;
  onDismiss(): void;
}

const RUBBER_BAND = 0.2;
const VELOCITY_WINDOW_MS = 100;

/**
 * The drag logic of a drawer, with no DOM and no signals: feed it pointer samples (`start`, `move`, `end`) and it reports
 * where the panel is (`onMove`), which snap point it settled on (`onSnap`) or that it was dismissed (`onDismiss`).
 *
 * - A press becomes a drag once the pointer has travelled `slop` px; travelling mostly across the drawer's axis cancels the
 *   gesture (so a sideways swipe in a bottom drawer is left to the content).
 * - Dragging is followed 1:1; dragging past the largest snap point is rubber-banded.
 * - On release the speed over the last 100ms decides first: faster than `velocityThreshold` moves to the next snap point in
 *   that direction (past the lowest one: dismiss). Otherwise the nearest snap point wins, and the panel is dismissed when
 *   it was dragged `dismissThreshold` of the way below the lowest snap point.
 */
export class DrawerDragEngine {
  private phase: "idle" | "pending" | "dragging" = "idle";
  private origin = 0;
  private cross0 = 0;
  private startFraction = 1;
  private offset = 0;
  private samples: { d: number; t: number }[] = [];
  /** The visible fraction the panel rests at. */
  fraction: number;

  constructor(private o: DrawerDragEngineOptions) {
    const snaps = this.snaps();
    this.fraction = snaps[snaps.length - 1]!;
  }

  get dragging(): boolean {
    return this.phase === "dragging";
  }

  /** Visible fractions, ascending, within (0, 1]. */
  snaps(): number[] {
    const list = (this.o.snapPoints?.() ?? [1]).filter((f) => f > 0 && f <= 1).sort((a, b) => a - b);
    return list.length > 0 ? list : [1];
  }

  private horizontal() {
    const side = this.o.side();
    return side === "left" || side === "right";
  }
  /** +1 when moving along the axis's positive direction closes the drawer. */
  private sign() {
    const side = this.o.side();
    return side === "bottom" || side === "right" ? 1 : -1;
  }
  private along(p: DrawerPoint) {
    return (this.horizontal() ? p.x : p.y) * this.sign();
  }
  private across(p: DrawerPoint) {
    return this.horizontal() ? p.y : p.x;
  }

  /** Moves the resting position (the drawer opened, or the owner picked a snap point). */
  setSnap(fraction: number): void {
    this.phase = "idle";
    this.fraction = fraction;
    this.offset = (1 - fraction) * this.o.size();
    this.o.onMove(this.offset, false);
  }

  start(p: DrawerPoint): void {
    this.phase = "pending";
    this.origin = this.along(p);
    this.cross0 = this.across(p);
    this.startFraction = this.fraction;
    this.samples = [{ d: 0, t: p.time }];
  }

  move(p: DrawerPoint): void {
    if (this.phase === "idle") return;
    const d = this.along(p) - this.origin;
    if (this.phase === "pending") {
      const slop = this.o.slop ?? 4;
      const cross = Math.abs(this.across(p) - this.cross0);
      if (Math.abs(d) < slop && cross < slop) return;
      if (cross > Math.abs(d)) {
        this.phase = "idle";
        return;
      }
      this.phase = "dragging";
    }
    this.samples.push({ d, t: p.time });
    const size = this.o.size();
    const snaps = this.snaps();
    const base = (1 - this.startFraction) * size;
    const min = (1 - snaps[snaps.length - 1]!) * size;
    let offset = base + d;
    if (offset < min) offset = min - (min - offset) * RUBBER_BAND;
    this.offset = Math.min(offset, size);
    this.o.onMove(this.offset, true);
  }

  /** Release: settles on a snap point or dismisses. */
  end(p?: DrawerPoint): void {
    if (this.phase !== "dragging") {
      this.phase = "idle";
      return;
    }
    this.phase = "idle";
    const size = this.o.size();
    const snaps = this.snaps();
    const visible = size > 0 ? 1 - this.offset / size : 0;
    const threshold = this.o.velocityThreshold ?? 0.4;
    const v = this.velocity();
    const targets = [0, ...snaps];
    let target: number;
    if (Math.abs(v) > threshold) {
      const eps = 1e-6;
      target = v > 0 ? ([...targets].reverse().find((t) => t < visible - eps) ?? 0) : (targets.find((t) => t > visible + eps) ?? snaps[snaps.length - 1]!);
    } else if (visible < snaps[0]! * (1 - (this.o.dismissThreshold ?? 0.5))) {
      target = 0;
    } else {
      target = snaps.reduce((best, f) => (Math.abs(f - visible) < Math.abs(best - visible) ? f : best), snaps[0]!);
    }
    void p;
    if (target === 0) {
      this.o.onMove(size, false);
      this.o.onDismiss();
      return;
    }
    this.fraction = target;
    this.offset = (1 - target) * size;
    this.o.onMove(this.offset, false);
    this.o.onSnap?.(target);
  }

  /** The gesture was interrupted (pointercancel): go back to the resting position. */
  cancel(): void {
    if (this.phase === "dragging") this.setSnap(this.fraction);
    this.phase = "idle";
  }

  /** px/ms toward the closing edge over the last 100ms of the gesture. */
  private velocity(): number {
    const last = this.samples[this.samples.length - 1];
    if (!last) return 0;
    const recent = this.samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW_MS);
    const first = recent[0];
    if (!first || recent.length < 2) return 0;
    const dt = last.t - first.t;
    return dt > 0 ? (last.d - first.d) / dt : 0;
  }
}

/** Options for `useDrawerDrag` and the `uiDrawerDrag` directive. `side` and `onDismiss` are required; the thresholds mirror `DrawerDragEngineOptions`. */
export interface DrawerDragOptions {
  side: () => DrawerSide;
  snapPoints?: () => readonly number[];
  /** Whether dragging is on. Default true. */
  enabled?: () => boolean;
  velocityThreshold?: number;
  dismissThreshold?: number;
  slop?: number;
  /** Panel extent in px. Default: the host's bounding box. */
  size?: () => number;
  /** Duration of the settle transition in ms. Default 300. */
  settleMs?: number;
  onSnap?(fraction: number): void;
  /** How much of the panel is visible, 0 to 1, whenever it moves (a drag, a settle, a snap change, an exit). Drives a backdrop. */
  onProgress?(visible: number, dragging: boolean): void;
  onDismiss(): void;
}

/** What `useDrawerDrag` returns: drag state signals and methods to move the panel to a snap point, animate it out or clear the drag styles. */
export interface DrawerDragHandle {
  readonly dragging: ReadonlySignal<boolean>;
  /** The snap fraction the panel rests at. */
  readonly snap: ReadonlySignal<number>;
  /** Positions the panel at a snap fraction without animation (on open; a fraction of 1 clears the inline transform), or animated (`animate`, a snap change while open). */
  setSnap(fraction: number, animate?: boolean): void;
  /**
   * Call when the drawer closes without a drag (Escape, a button): from a snap point below full, slides the panel out from where
   * it rests instead of letting the CSS exit animation restart from the natural position. At full height it does nothing (the CSS exit runs).
   */
  exit(): void;
  /** Clears everything the drag put on the host. */
  reset(): void;
}

/** Elements a press on which starts something else: text entry, buttons, links and anything marked `data-drawer-no-drag`. */
const NO_DRAG = "input, textarea, select, button, a[href], [contenteditable=''], [contenteditable='true'], [data-drawer-no-drag]";

type El = {
  closest?(s: string): unknown;
  parentElement?: El | null;
  scrollTop?: number;
  scrollLeft?: number;
  scrollHeight?: number;
  scrollWidth?: number;
  clientHeight?: number;
  clientWidth?: number;
  getBoundingClientRect?(): { width: number; height: number };
  setPointerCapture?(id: number): void;
  releasePointerCapture?(id: number): void;
};

/** True when `target` sits inside a scroller (below `host`) that can still scroll in the direction the drag would pull. */
function scrolledAway(target: El | null, host: El, side: DrawerSide): boolean {
  const g = globalThis as unknown as { getComputedStyle?: (el: unknown) => { overflowY?: string; overflowX?: string } };
  const horizontal = side === "left" || side === "right";
  for (let el = target; el && el !== host; el = el.parentElement ?? null) {
    const style = g.getComputedStyle?.(el);
    const overflow = horizontal ? style?.overflowX : style?.overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    const scroll = (horizontal ? el.scrollLeft : el.scrollTop) ?? 0;
    const max = ((horizontal ? el.scrollWidth : el.scrollHeight) ?? 0) - ((horizontal ? el.clientWidth : el.clientHeight) ?? 0);
    if (max <= 0) continue;
    // pulling toward the closing edge scrolls the content back toward its start (its end, for top and left edges)
    const towardsStart = side === "bottom" || side === "right";
    if (towardsStart ? scroll > 0 : scroll < max) return true;
  }
  return false;
}

/**
 * Pointer drag-to-dismiss and snap points for a drawer panel (`useDrawerDrag` is the function, `uiDrawerDrag` the directive).
 * Listens for `pointerdown`/`pointermove`/`pointerup`/`pointercancel` on the host (mouse, touch and pen alike, with pointer
 * capture), so give the element `touch-action: none` where a touch should drag (a handle or header): elsewhere the browser
 * keeps its own panning. A press on a form control, button, link or `[data-drawer-no-drag]`, or inside content that is scrolled
 * away from the edge, never starts a drag. The panel is moved with an inline `transform` (and `transition: none` while
 * dragging); a settle or dismissal animates with `transition: transform`. The host gets `data-dragging` while held and
 * `data-dragged` after a drag dismissal, so CSS can skip its exit animation (the transition does the exit).
 *
 * It is renderer neutral (`Renderer.listen` and `setStyle`); the DOM-specific parts (bounding box, pointer capture,
 * scroller check) are skipped on nodes without them. The drag itself is `DrawerDragEngine`.
 */
export function useDrawerDrag<N = unknown>(options: DrawerDragOptions, target: { renderer: Renderer<N>; host: N } = injectHost<N>()): DrawerDragHandle {
  const { renderer, host } = target;
  const node = host as unknown as El;
  const dragging = signal(false);
  const snap = signal(1);
  const settleMs = options.settleMs ?? 300;
  const horizontal = () => options.side() === "left" || options.side() === "right";
  const sign = () => (options.side() === "bottom" || options.side() === "right" ? 1 : -1);
  const size = () => {
    if (options.size) return options.size();
    const box = node.getBoundingClientRect?.();
    return (horizontal() ? box?.width : box?.height) ?? 0;
  };
  const transform = (value: string) => (horizontal() ? `translate3d(${value},0,0)` : `translate3d(0,${value},0)`);
  const settle = `transform ${settleMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;

  // The panel's size can change while open (content, resize): measure when a gesture starts and use it until it ends.
  let measured = 0;
  let exited = false;
  const engine = new DrawerDragEngine({
    side: options.side,
    size: () => measured,
    snapPoints: options.snapPoints,
    velocityThreshold: options.velocityThreshold,
    dismissThreshold: options.dismissThreshold,
    slop: options.slop,
    onMove(offset, isDragging) {
      renderer.setAttribute(host, "data-dragging", isDragging ? "" : null);
      if (dragging() !== isDragging) dragging.set(isDragging);
      renderer.setStyle(host, "transition", isDragging ? "none" : settle);
      renderer.setStyle(host, "transform", transform(`${sign() * offset}px`));
      options.onProgress?.(measured > 0 ? Math.max(0, 1 - offset / measured) : 1, isDragging);
    },
    onSnap(fraction) {
      snap.set(fraction);
      options.onSnap?.(fraction);
    },
    onDismiss() {
      exited = true;
      renderer.setAttribute(host, "data-dragged", "");
      options.onDismiss();
    },
  });

  const point = (event: unknown): DrawerPoint => {
    const e = event as { clientX?: number; clientY?: number; timeStamp?: number };
    return { x: e.clientX ?? 0, y: e.clientY ?? 0, time: e.timeStamp ?? Date.now() };
  };
  let pointerId: number | null = null;
  const release = () => {
    if (pointerId !== null) {
      try {
        node.releasePointerCapture?.(pointerId);
      } catch {
        // already released
      }
    }
    pointerId = null;
  };
  const mine = (event: unknown) => pointerId !== null && ((event as { pointerId?: number }).pointerId ?? 0) === pointerId;

  const off = [
    renderer.listen(host, "pointerdown", (event) => {
      const e = event as { button?: number; isPrimary?: boolean; pointerId?: number; target?: El | null };
      if (options.enabled && !options.enabled()) return;
      if ((e.button ?? 0) !== 0 || e.isPrimary === false || pointerId !== null) return;
      const t = e.target ?? null;
      if (t?.closest?.(NO_DRAG) || scrolledAway(t, node, options.side())) return;
      measured = size();
      if (measured <= 0) return;
      pointerId = e.pointerId ?? 0;
      try {
        node.setPointerCapture?.(pointerId);
      } catch {
        // a synthetic pointer id has nothing to capture
      }
      engine.start(point(event));
    }),
    renderer.listen(host, "pointermove", (event) => {
      if (mine(event)) engine.move(point(event));
    }),
    renderer.listen(host, "pointerup", (event) => {
      if (!mine(event)) return;
      release();
      engine.end(point(event));
    }),
    renderer.listen(host, "pointercancel", (event) => {
      if (!mine(event)) return;
      release();
      engine.cancel();
    }),
  ];
  currentScope()?.onDispose(() => off.forEach((fn) => fn()));

  const clear = () => {
    renderer.setStyle(host, "transform", null);
    renderer.setStyle(host, "transition", null);
    renderer.setAttribute(host, "data-dragging", null);
    renderer.setAttribute(host, "data-dragged", null);
  };
  return {
    dragging,
    snap,
    setSnap(fraction, animate = false) {
      untracked(() => {
        exited = false;
        const to = transform(`${sign() * (1 - fraction) * 100}%`);
        if (animate) {
          renderer.setAttribute(host, "data-dragging", null);
          renderer.setAttribute(host, "data-dragged", null);
          renderer.setStyle(host, "transition", settle);
          renderer.setStyle(host, "transform", to);
        } else {
          clear();
          if (fraction < 1) renderer.setStyle(host, "transform", to);
        }
        engine.fraction = fraction;
        snap.set(fraction);
        options.onProgress?.(fraction, false);
      });
    },
    exit() {
      untracked(() => {
        if (exited) return;
        exited = true;
        if (engine.fraction >= 1) return;
        renderer.setAttribute(host, "data-dragging", null);
        renderer.setAttribute(host, "data-dragged", "");
        renderer.setStyle(host, "transition", settle);
        renderer.setStyle(host, "transform", transform(`${sign() * 100}%`));
        options.onProgress?.(0, false);
      });
    },
    reset() {
      untracked(() => {
        exited = false;
        clear();
        dragging.set(false);
      });
    },
  };
}

/**
 * `<div uiDrawerDrag side="bottom" [open]="open()" [snapPoints]="[0.4, 1]" [activeSnap]="snap()" (dismiss)="open.set(false)" (snapChange)="snap.set($event)">`:
 * drag to dismiss, with optional snap points, on the element. `open` re-arms the panel each time the drawer opens.
 */
export class UiDrawerDrag {
  static meta = { selector: "[uiDrawerDrag]" };
  side = input<DrawerSide>("bottom");
  open = input<boolean>(true);
  snapPoints = input<readonly number[]>([1]);
  /** The snap fraction to rest at while open; defaults to the largest snap point. */
  activeSnap = input<number | null>(null);
  enabled = input<boolean>(true);
  dismiss = output<void>();
  snapChange = output<number>();
  /** The visible fraction of the panel (0 to 1) and whether a drag is in progress, on every move. */
  progress = output<{ value: number; dragging: boolean }>();
  handle = useDrawerDrag({
    side: () => this.side(),
    snapPoints: () => this.snapPoints(),
    enabled: () => this.enabled(),
    onDismiss: () => this.dismiss.emit(),
    onSnap: (fraction) => this.snapChange.emit(fraction),
    onProgress: (value, dragging) => this.progress.emit({ value, dragging }),
  });
  private wasOpen = false;
  private arm = effect(() => {
    const open = this.open();
    const snaps = [...this.snapPoints()].sort((a, b) => a - b);
    const wanted = this.activeSnap() ?? snaps[snaps.length - 1] ?? 1;
    if (open) this.handle.setSnap(wanted, this.wasOpen);
    else if (this.wasOpen) this.handle.exit();
    this.wasOpen = open;
  });
}
