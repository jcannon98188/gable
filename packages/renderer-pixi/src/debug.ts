// Dev-only canvas devtools (TASK-104.14): the frame statistics and overlay, and the scene boundary the devtools hook reports.
// Nothing here is reached in a production build: the renderer only touches it behind `if (DEV)`, so a bundler drops it
// (`define: { __GABLE_DEV__: false }`). Free of any pixi.js import: nodes are read through the few members used below.
import type { BoundaryNodeSpec, BoundarySpec, GableDevtoolsHook, PageRect } from "@gable/core/devtools";
import type { CanvasDebugOptions } from "./canvas-debug.js";

const DEFAULT_BUDGET_MS = 1000 / 60;
const DEFAULT_WINDOW = 120;
const DEFAULT_EVERY = 10;

/** The phases of one frame, in milliseconds, plus what the frame held. */
export interface FrameSample {
  /** The frame's timestamp in milliseconds (the loop's own clock); the gap to the previous one is what counts a drop. */
  at: number;
  hooks: number;
  flush: number;
  render: number;
  /** Display objects in the scene. */
  objects: number;
  /** Effects that ran in the frame's flush (template bindings, mostly). */
  bindings: number;
}

export interface PhaseStats {
  /** The last frame's time. */
  last: number;
  p50: number;
  p95: number;
}

export interface FrameStatsSnapshot {
  /** Frames measured so far. */
  frames: number;
  hooks: PhaseStats;
  flush: PhaseStats;
  render: PhaseStats;
  /** Hooks, flush and render together: the JavaScript cost of the frame. */
  total: PhaseStats;
  /** Frames that did not happen: a gap of more than one and a half budgets counts the animation frames it skipped. */
  dropped: number;
  objects: number;
  bindings: number;
  budgetMs: number;
}

const rank = (sorted: number[], q: number): number => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!);

class Window {
  readonly #values: number[] = [];
  constructor(readonly size: number) {}
  push(v: number) {
    this.#values.push(v);
    if (this.#values.length > this.size) this.#values.shift();
  }
  stats(): PhaseStats {
    const sorted = [...this.#values].sort((a, b) => a - b);
    return { last: this.#values.at(-1) ?? 0, p50: rank(sorted, 0.5), p95: rank(sorted, 0.95) };
  }
}

/** Rolling frame statistics: per-phase time with p50 and p95 over the last N frames, dropped frames, object and binding counts. */
export class FrameStats {
  readonly #budget: number;
  readonly #hooks: Window;
  readonly #flush: Window;
  readonly #render: Window;
  readonly #total: Window;
  #frames = 0;
  #dropped = 0;
  #previous: number | null = null;
  #objects = 0;
  #bindings = 0;

  constructor(options: Pick<CanvasDebugOptions, "budgetMs" | "window"> = {}) {
    this.#budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
    const size = Math.max(1, options.window ?? DEFAULT_WINDOW);
    this.#hooks = new Window(size);
    this.#flush = new Window(size);
    this.#render = new Window(size);
    this.#total = new Window(size);
  }

  record(sample: FrameSample): void {
    if (this.#previous !== null) {
      const gap = sample.at - this.#previous;
      if (gap > this.#budget * 1.5) this.#dropped += Math.max(1, Math.round(gap / this.#budget) - 1);
    }
    this.#previous = sample.at;
    this.#frames++;
    this.#hooks.push(sample.hooks);
    this.#flush.push(sample.flush);
    this.#render.push(sample.render);
    this.#total.push(sample.hooks + sample.flush + sample.render);
    this.#objects = sample.objects;
    this.#bindings = sample.bindings;
  }

  snapshot(): FrameStatsSnapshot {
    return {
      frames: this.#frames,
      hooks: this.#hooks.stats(),
      flush: this.#flush.stats(),
      render: this.#render.stats(),
      total: this.#total.stats(),
      dropped: this.#dropped,
      objects: this.#objects,
      bindings: this.#bindings,
      budgetMs: this.#budget,
    };
  }
}

const ms = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));

/** The overlay: a small fixed-width panel in a corner of the canvas host that never takes pointer input. */
export class FrameOverlay {
  readonly element: HTMLElement;
  readonly #rows = new Map<string, HTMLElement>();

  constructor(host: HTMLElement) {
    const doc = host.ownerDocument;
    const el = doc.createElement("div");
    el.setAttribute("data-gable-canvas-debug", "");
    el.setAttribute("aria-hidden", "true");
    el.setAttribute(
      "style",
      "position:absolute;top:4px;left:4px;z-index:2147483646;pointer-events:none;padding:4px 6px;border-radius:4px;background:rgba(0,0,0,.72);color:#fff;font:11px/1.35 ui-monospace,monospace;white-space:pre",
    );
    for (const key of ["frame", "phases", "counts"]) {
      const row = doc.createElement("div");
      row.dataset.row = key;
      el.append(row);
      this.#rows.set(key, row);
    }
    host.append(el);
    this.element = el;
  }

  update(s: FrameStatsSnapshot): void {
    const over = s.total.p95 > s.budgetMs;
    this.#rows.get("frame")!.textContent = `frame ${ms(s.total.last)} ms  p50 ${ms(s.total.p50)}  p95 ${ms(s.total.p95)}`;
    this.#rows.get("frame")!.style.color = over ? "#ff8a80" : "";
    this.#rows.get("phases")!.textContent = `hooks ${ms(s.hooks.last)}  flush ${ms(s.flush.last)}  render ${ms(s.render.last)}`;
    this.#rows.get("counts")!.textContent = `dropped ${s.dropped}  objects ${s.objects}  bindings ${s.bindings}`;
  }

  destroy(): void {
    this.element.remove();
  }
}

// --- the scene boundary ------------------------------------------------------

/** The members of a Pixi display object the devtools read. */
export interface SceneNodeLike {
  readonly children: readonly SceneNodeLike[];
  readonly destroyed?: boolean;
  getBounds?(): { x: number; y: number; width: number; height: number };
}

/** The number of display objects below `root` (the root itself is not counted). */
export function countObjects(root: SceneNodeLike): number {
  let count = 0;
  const stack: SceneNodeLike[] = [...root.children];
  while (stack.length > 0) {
    const node = stack.pop()!;
    count++;
    for (const child of node.children) stack.push(child);
  }
  return count;
}

/** The scene as a flat node list for the devtools hook, parents before children, the root first. */
export function sceneNodes(root: SceneNodeLike, describe: (node: SceneNodeLike) => { tag: string; kind: string }): BoundaryNodeSpec[] {
  const out: BoundaryNodeSpec[] = [];
  const walk = (node: SceneNodeLike, parent: SceneNodeLike | null) => {
    if (node.destroyed) return;
    const { tag, kind } = describe(node);
    out.push({ node, parent, name: tag, tag, kind });
    for (const child of node.children) walk(child, node);
  };
  walk(root, null);
  return out;
}

export interface SceneBoundaryOptions {
  label: string;
  root: SceneNodeLike;
  describe: (node: SceneNodeLike) => { tag: string; kind: string };
  /** The element hosting the canvas, for placing nodes on the page. */
  host?: () => unknown;
}

let boundaryCount = 0;

/**
 * Registers the scene with the devtools hook, now or when the hook appears (the hook installs before the app, but a boundary
 * may be built before a late client asks). Returns the function that unregisters it.
 */
export function registerSceneBoundary(options: SceneBoundaryOptions): () => void {
  const id = `scene-${++boundaryCount}`;
  const spec: BoundarySpec = {
    label: options.label,
    kind: "scene",
    snapshot: () => sceneNodes(options.root, options.describe),
    get host() {
      return options.host?.();
    },
    rectOf(node) {
      const n = node as SceneNodeLike;
      if (n.destroyed || !n.getBounds) return null;
      const b = n.getBounds();
      return { x: b.x, y: b.y, width: b.width, height: b.height } satisfies PageRect;
    },
  };
  let handle: { dispose(): void } | null = null;
  let stopped = false;
  const attach = () => {
    const hook: GableDevtoolsHook | undefined = globalThis.__GABLE_DEVTOOLS_HOOK__;
    if (stopped || handle || !hook?.registerBoundary) return;
    handle = hook.registerBoundary(id, spec);
  };
  attach();
  const later = typeof addEventListener === "function";
  if (!handle && later) addEventListener("gable:devtools-ready", attach, { once: true });
  return () => {
    stopped = true;
    handle?.dispose();
    handle = null;
    if (later) removeEventListener("gable:devtools-ready", attach);
  };
}
