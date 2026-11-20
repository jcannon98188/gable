// @vitest-environment jsdom
// Canvas devtools (canvas/139): the frame overlay, the scene boundary the devtools hook reports, and the production build.
import { Container } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap, flushSync, html, inject, signal } from "@gable/core";
import { createDevtools, type BoundaryTree, type DevtoolsInstance } from "@gable/core/devtools";
import { createDomRenderer } from "@gable/renderer-dom";
import { Frame, GableCanvas, pixiRenderer, provideCanvasDebug, type ApplicationLike, type FrameScheduler, type PixiRendererOptions } from "./index.js";
import { FrameOverlay, FrameStats, countObjects, sceneNodes } from "./debug.js";

describe("FrameStats", () => {
  const sample = (at: number, total: number, extra: Partial<Parameters<FrameStats["record"]>[0]> = {}) => ({ at, hooks: total / 4, flush: total / 2, render: total / 4, objects: 0, bindings: 0, ...extra });

  it("keeps per-phase times, the last frame and a rolling p50 and p95", () => {
    const stats = new FrameStats({ window: 100 });
    for (let i = 1; i <= 100; i++) stats.record({ at: i * 16, hooks: i, flush: 2 * i, render: 3 * i, objects: 0, bindings: 0 });
    const s = stats.snapshot();
    expect(s.frames).toBe(100);
    expect(s.hooks).toEqual({ last: 100, p50: 50, p95: 95 });
    expect(s.flush).toEqual({ last: 200, p50: 100, p95: 190 });
    expect(s.render).toEqual({ last: 300, p50: 150, p95: 285 });
    expect(s.total).toEqual({ last: 600, p50: 300, p95: 570 });
  });

  it("rolls: only the last `window` frames count", () => {
    const stats = new FrameStats({ window: 4 });
    for (const t of [100, 100, 100, 100, 1, 1, 1, 1]) stats.record(sample(stats.snapshot().frames * 16, t));
    expect(stats.snapshot().total.p95).toBe(1);
    expect(stats.snapshot().frames).toBe(8);
  });

  it("counts a frame as dropped when the loop skipped animation frames, and says how many", () => {
    const stats = new FrameStats({ budgetMs: 16 });
    stats.record(sample(0, 1));
    stats.record(sample(16, 1)); // on time
    stats.record(sample(40, 1)); // 24 ms: late by half a frame, not dropped
    expect(stats.snapshot().dropped).toBe(0);
    stats.record(sample(104, 1)); // 64 ms: four budgets, three frames missed
    expect(stats.snapshot().dropped).toBe(3);
  });

  it("reports the latest display-object and binding counts", () => {
    const stats = new FrameStats();
    stats.record(sample(0, 1, { objects: 5, bindings: 2 }));
    stats.record(sample(16, 1, { objects: 7, bindings: 0 }));
    expect(stats.snapshot()).toMatchObject({ objects: 7, bindings: 0 });
  });
});

describe("FrameOverlay", () => {
  it("is a corner panel that takes no input and shows every figure", () => {
    const host = document.createElement("div");
    const overlay = new FrameOverlay(host);
    const stats = new FrameStats({ budgetMs: 16 });
    stats.record({ at: 0, hooks: 0.5, flush: 1.25, render: 2.5, objects: 42, bindings: 7 });
    overlay.update(stats.snapshot());
    const el = host.querySelector("[data-gable-canvas-debug]") as HTMLElement;
    expect(el.getAttribute("style")).toContain("pointer-events:none");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    const text = el.textContent!;
    expect(text).toContain("frame 4.25 ms");
    expect(text).toContain("p50 4.25");
    expect(text).toContain("p95 4.25");
    expect(text).toContain("hooks 0.50");
    expect(text).toContain("flush 1.25");
    expect(text).toContain("render 2.50");
    expect(text).toContain("dropped 0");
    expect(text).toContain("objects 42");
    expect(text).toContain("bindings 7");
    overlay.destroy();
    expect(host.querySelector("[data-gable-canvas-debug]")).toBeNull();
  });
});

describe("scene tree helpers", () => {
  it("counts display objects below the root, not the root", () => {
    const root = new Container();
    const a = new Container();
    a.addChild(new Container(), new Container());
    root.addChild(a, new Container());
    expect(countObjects(root)).toBe(4);
  });

  it("lists the scene flat, parents first, skipping destroyed nodes", () => {
    const root = new Container();
    const a = new Container();
    const b = new Container();
    a.addChild(b);
    root.addChild(a);
    const nodes = sceneNodes(root, (n) => ({ tag: n === root ? "scene" : "container", kind: "Container" }));
    expect(nodes.map((n) => n.name)).toEqual(["scene", "container", "container"]);
    expect(nodes[2]!.parent).toBe(a);
    b.destroy();
    a.removeChild(b);
    expect(sceneNodes(root, () => ({ tag: "c", kind: "Container" }))).toHaveLength(2);
  });
});

// --- a real boundary ---------------------------------------------------------

function harness() {
  const stage = new Container();
  const canvas = document.createElement("canvas");
  let pending: ((time: number) => void) | null = null;
  const app: ApplicationLike = {
    async init() {},
    canvas,
    stage,
    render() {},
    renderer: { resize() {} },
    destroy() {
      canvas.remove();
    },
  };
  const scheduler: FrameScheduler = {
    request(cb) {
      pending = cb;
      return 1;
    },
    cancel() {
      pending = null;
    },
  };
  let now = 1000;
  let clock = 0;
  return {
    stage,
    canvas,
    options: { createApplication: () => app, scheduler } as PixiRendererOptions,
    /** The debug clock: advances by `step` on every read, so each phase of a frame takes `step` ms. */
    tickClock(step: number) {
      return () => (clock += step);
    },
    frame(ms = 16) {
      now += ms;
      const cb = pending;
      expect(cb, "a frame was requested").not.toBeNull();
      pending = null;
      cb!(now);
    },
    get scheduled() {
      return pending !== null;
    },
  };
}
type Harness = ReturnType<typeof harness>;

const live: Array<{ destroy(): void }> = [];
let dt: DevtoolsInstance | null = null;
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  dt?.dispose();
  dt = null;
  document.body.replaceChildren();
});

async function mountScene(h: Harness, scene: ReturnType<typeof html>, options: PixiRendererOptions, setup: object = {}, imports: unknown[] = []) {
  class Scene {
    static meta = { selector: "test-canvas", template: scene, imports, renderer: pixiRenderer({ ...h.options, ...options }) };
  }
  Object.assign(Scene.prototype, setup);
  class Page {
    static meta = { selector: "app-page", template: html`<test-canvas aria-label="Game"></test-canvas>`, imports: [Scene] };
  }
  const target = document.createElement("div");
  document.body.append(target);
  live.push(bootstrap(Page as never, { renderer: createDomRenderer(), target }));
  await vi.waitFor(() => expect(h.canvas.isConnected).toBe(true));
  await vi.waitFor(() => expect(h.scheduled).toBe(true));
  return target;
}

class Mover {
  static meta = { selector: "scene-mover", template: html`<container></container>` };
  frame = inject(Frame).onFrame(() => {});
}

describe("the frame overlay of a canvas boundary", () => {
  it("shows per-phase ms, p50, p95, dropped frames, object count and bindings re-run in the last frame", async () => {
    const h = harness();
    const x = signal(0);
    const target = await mountScene(h, html`<container><sprite [x]="x()"></sprite><sprite [y]="x()"></sprite></container>`, { debug: { every: 1, now: h.tickClock(2), budgetMs: 16 } }, { x });
    const overlay = () => target.querySelector("[data-gable-canvas-debug]") as HTMLElement;
    expect(overlay()).not.toBeNull();
    h.frame(16);
    // Nothing changed: each phase read the clock twice around it (2 ms per read), so hooks, flush and render each took 2 ms.
    expect(overlay().textContent).toContain("hooks 2.00");
    expect(overlay().textContent).toContain("flush 2.00");
    expect(overlay().textContent).toContain("render 2.00");
    expect(overlay().textContent).toContain("objects 3");
    expect(overlay().textContent).toContain("bindings 0");
    x.set(1);
    h.frame(16);
    expect(overlay().textContent).toContain("bindings 2"); // both sprites' bindings re-ran
    h.frame(80); // a stall of five budgets
    expect(overlay().textContent).toContain("dropped 4");
    expect(overlay().textContent).toMatch(/p50 \d/);
    expect(overlay().textContent).toMatch(/p95 \d/);
  });

  it("is off unless asked for", async () => {
    const h = harness();
    const target = await mountScene(h, html`<container></container>`, {});
    h.frame();
    expect(target.querySelector("[data-gable-canvas-debug]")).toBeNull();
  });

  it("is removed with the boundary", async () => {
    const h = harness();
    const target = await mountScene(h, html`<container></container>`, { debug: true });
    expect(target.querySelector("[data-gable-canvas-debug]")).not.toBeNull();
    while (live.length) live.pop()!.destroy();
    expect(document.querySelector("[data-gable-canvas-debug]")).toBeNull();
  });

  it("refreshes only every N frames, so the overlay is not a DOM write per frame", async () => {
    const h = harness();
    const target = await mountScene(h, html`<container></container>`, { debug: { every: 3, now: h.tickClock(1) } });
    const frameRow = () => target.querySelector("[data-gable-canvas-debug] [data-row=frame]")!.textContent;
    h.frame();
    const first = frameRow();
    h.frame();
    h.frame();
    expect(frameRow()).toBe(first);
    h.frame();
    expect(target.querySelector("[data-row=counts]")!.textContent).toContain("objects");
  });
});

describe("<gable-canvas debug> and provideCanvasDebug()", () => {
  async function mountHost(h: Harness, template: ReturnType<typeof html>, providers: unknown[] = []) {
    class Page {
      static meta = { selector: "app-page", template, imports: [GableCanvas] };
    }
    Object.assign(Page.prototype, { options: h.options });
    const target = document.createElement("div");
    document.body.append(target);
    live.push(bootstrap(Page as never, { renderer: createDomRenderer(), target, providers: providers as never }));
    await vi.waitFor(() => expect(h.canvas.isConnected).toBe(true));
    await vi.waitFor(() => expect(h.scheduled).toBe(true));
    return target;
  }

  it("the debug attribute turns the overlay on for that canvas", async () => {
    const h = harness();
    const target = await mountHost(h, html`<gable-canvas debug [options]="options"></gable-canvas>`);
    expect(target.querySelector("gable-canvas [data-gable-canvas-debug]")).not.toBeNull();
  });

  it("a canvas without it has none", async () => {
    const h = harness();
    const target = await mountHost(h, html`<gable-canvas [options]="options"></gable-canvas>`);
    expect(target.querySelector("[data-gable-canvas-debug]")).toBeNull();
  });

  it("provideCanvasDebug() turns it on for every canvas, and its options apply", async () => {
    const h = harness();
    const target = await mountHost(h, html`<gable-canvas [options]="options"></gable-canvas>`, provideCanvasDebug({ budgetMs: 8 }));
    expect(target.querySelector("[data-gable-canvas-debug]")).not.toBeNull();
  });
});

describe("the scene boundary in the devtools hook", () => {
  function install() {
    dt = createDevtools(globalThis as never);
    dt.hook.connect(() => {}); // effect runs are recorded while a client is connected
    return dt;
  }
  const tree = () => {
    const boundaries = dt!.hook.call("boundaries", undefined) as Array<{ id: string }>;
    return dt!.hook.call("boundaryTree", { id: boundaries[0]!.id }) as BoundaryTree;
  };

  it("registers the scene when it mounts, labelled from the host, and unregisters on destroy", async () => {
    const d = install();
    const h = harness();
    await mountScene(h, html`<container></container>`, {});
    expect(d.hook.call("boundaries", undefined)).toEqual([expect.objectContaining({ kind: "scene", label: "Game" })]);
    while (live.length) live.pop()!.destroy();
    expect(d.hook.call("boundaries", undefined)).toEqual([]);
  });

  it("reports the display-object tree with tags and the owning component", async () => {
    install();
    const h = harness();
    await mountScene(h, html`<container><sprite></sprite><text></text></container><scene-mover></scene-mover>`, {}, {}, [Mover]);
    flushSync();
    const t = tree();
    expect(t.nodes.map((n) => n.name)).toEqual(["scene", "container", "sprite", "text", "scene-mover", "container"]);
    expect(t.nodes.map((n) => n.kind).slice(0, 4)).toEqual(["Container", "Container", "Sprite", "Text"]);
    expect(t.nodes[2]!.parent).toBe(t.nodes[1]!.id);
    // The scene-mover host is a component: it owns its subtree.
    expect(t.nodes.find((n) => n.name === "scene-mover")!.component).toMatchObject({ name: "Mover" });
  });

  it("shows the effects of the last flush on the node they updated, with the signal write that caused them", async () => {
    install();
    const h = harness();
    const x = signal(0);
    await mountScene(h, html`<sprite [x]="x()"></sprite><sprite [y]="1"></sprite>`, {}, { x });
    await Promise.resolve();
    flushSync();
    h.frame();
    x.set(5);
    h.frame(); // the loop's flushSync runs the binding
    const sprites = tree().nodes.filter((n) => n.name === "sprite");
    expect(sprites[0]!.effects).toHaveLength(1);
    expect(sprites[0]!.effects[0]).toMatchObject({ first: false });
    expect(sprites[0]!.effects[0]!.causes).toHaveLength(1);
    expect(sprites[1]!.effects).toEqual([]);
    const why = dt!.hook.call("why", { id: sprites[0]!.effects[0]!.id }) as { nodes: Array<{ binding: { what: string } | null }> };
    expect(why.nodes[0]!.binding).toMatchObject({ what: "prop:x" });
  });

  it("gives every node a page box once the canvas is laid out", async () => {
    install();
    const h = harness();
    await mountScene(h, html`<container><sprite></sprite></container>`, {});
    const nodes = tree().nodes;
    expect(nodes[0]!.rect).not.toBeNull();
    expect(typeof nodes[0]!.rect!.width).toBe("number");
  });

  it("registers with a hook that appears after the scene mounted", async () => {
    const h = harness();
    await mountScene(h, html`<container></container>`, {});
    install();
    globalThis.dispatchEvent(new Event("gable:devtools-ready"));
    expect(dt!.hook.call("boundaries", undefined)).toHaveLength(1);
  });
});
