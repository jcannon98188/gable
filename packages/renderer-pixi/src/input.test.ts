// @vitest-environment jsdom
// Input (canvas/113): federated events on scene tags and the Pointer, Keyboard and Gamepad services, driven through
// the same manual-scheduler application double the frame loop tests use.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Container, EventSystem, Rectangle } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap, flushSync, html, inject, signal } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { Gamepad, GableCanvas, Keyboard, Pointer, pixiRenderer, type ApplicationLike, type FrameScheduler, type PixiRendererOptions } from "./index.js";

function harness(extra: Partial<PixiRendererOptions> = {}) {
  const stage = new Container();
  const canvas = document.createElement("canvas");
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
  let pending: ((time: number) => void) | null = null;
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
  return {
    stage,
    canvas,
    options: { createApplication: () => app, scheduler, ...extra } as PixiRendererOptions,
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
    /** The scene root the renderer attached to the stage. */
    get scene(): Container {
      return stage.children[0] as Container;
    },
    /** The element the scene is hosted in (the test host's element). */
    get host(): HTMLElement {
      return canvas.parentElement!;
    },
  };
}
type Harness = ReturnType<typeof harness>;

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

async function mountScene(h: Harness, scene: ReturnType<typeof html>, setup: object = {}, imports: unknown[] = []) {
  class Scene {
    static meta = { selector: "test-canvas", template: scene, imports, renderer: pixiRenderer(h.options) };
  }
  Object.assign(Scene.prototype, setup);
  class Page {
    static meta = { selector: "app-page", template: html`<test-canvas></test-canvas>`, imports: [GableCanvas, Scene] };
  }
  const target = document.createElement("div");
  document.body.append(target);
  live.push(bootstrap(Page as never, { renderer: createDomRenderer(), target }));
  await vi.waitFor(() => expect(h.canvas.isConnected).toBe(true));
  await vi.waitFor(() => expect(h.scheduled).toBe(true));
}

/** A scene component that hands the injected services to the test. */
function probe() {
  const got: { pointer?: Pointer; keyboard?: Keyboard; gamepad?: Gamepad } = {};
  class Probe {
    static meta = { selector: "scene-probe", template: html`<container></container>` };
    services = (Object.assign(got, { pointer: inject(Pointer), keyboard: inject(Keyboard), gamepad: inject(Gamepad) }), 0);
  }
  return { got, Probe };
}

const pointerEvent = (x: number, y: number, buttons = 0) => ({ global: { x, y }, buttons });

describe("federated events on scene tags", () => {
  it("a listener makes the node interactive and receives Pixi's own event unwrapped", async () => {
    const h = harness();
    const seen: unknown[] = [];
    await mountScene(h, html`<container (pointerdown)="down($event)"></container>`, { down: (e: unknown) => seen.push(e) });
    const node = h.scene.children[0]!;
    expect(node.eventMode).toBe("static");
    const event = pointerEvent(3, 4);
    node.emit("pointerdown", event as never);
    expect(seen).toEqual([event]);
    expect(seen[0]).toBe(event);
  });

  it("covers the other federated names, including wheel", async () => {
    const h = harness();
    const names: string[] = [];
    await mountScene(h, html`<container (pointertap)="log('tap')" (rightdown)="log('rightdown')" (wheel)="log('wheel')" (pointerupoutside)="log('upoutside')"></container>`, {
      log: (n: string) => names.push(n),
    });
    const node = h.scene.children[0]!;
    for (const n of ["pointertap", "rightdown", "wheel", "pointerupoutside"]) node.emit(n as never, {} as never);
    expect(names).toEqual(["tap", "rightdown", "wheel", "upoutside"]);
  });

  it("[eventMode], [cursor] and [hitArea] are plain properties; the eventMode override wins over the automatic mode", async () => {
    const h = harness();
    const area = new Rectangle(0, 0, 10, 10);
    await mountScene(h, html`<container [eventMode]="'dynamic'" cursor="pointer" [hitArea]="area" (pointermove)="noop()"></container>`, { area, noop() {} });
    const node = h.scene.children[0]!;
    expect(node.eventMode).toBe("dynamic");
    expect(node.cursor).toBe("pointer");
    expect(node.hitArea).toBe(area);
  });

  it("removes the listener when the node goes away", async () => {
    const h = harness();
    const show = signal(true);
    const hits: number[] = [];
    await mountScene(h, html`@if (show()) {<container (pointerdown)="hit()"></container>}`, { show, hit: () => hits.push(1) });
    const node = h.scene.children[0]!;
    node.emit("pointerdown", {} as never);
    show.set(false);
    flushSync();
    node.emit("pointerdown", {} as never);
    expect(hits).toHaveLength(1);
  });
});

describe("Pointer", () => {
  it("exposes position (scene coordinates), buttons and over-canvas as signals driven by the stage", async () => {
    const h = harness();
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    const p = got.pointer!;
    expect(p.position()).toEqual({ x: 0, y: 0 });
    expect(p.buttons()).toBe(0);
    expect(p.overCanvas()).toBe(false);

    h.stage.emit("pointerenter", pointerEvent(0, 0) as never);
    expect(p.overCanvas()).toBe(true);
    h.scene.position.set(100, 50); // scene coordinates, not canvas coordinates
    h.stage.emit("pointermove", pointerEvent(110, 70) as never);
    expect(p.position()).toEqual({ x: 10, y: 20 });
    h.stage.emit("pointerdown", pointerEvent(110, 70, 1) as never);
    expect(p.buttons()).toBe(1);
    h.stage.emit("pointerdown", pointerEvent(110, 70, 3) as never);
    expect(p.buttons()).toBe(3);
    h.stage.emit("pointerup", pointerEvent(110, 70, 1) as never);
    expect(p.buttons()).toBe(1);
    h.stage.emit("pointerupoutside", pointerEvent(500, 500, 0) as never);
    expect(p.buttons()).toBe(0);
    h.stage.emit("pointerleave", pointerEvent(0, 0) as never);
    expect(p.overCanvas()).toBe(false);
  });

  it("makes the stage a pointer target covering the canvas, so moves over empty space are seen", async () => {
    const h = harness({ width: 320, height: 200 });
    await mountScene(h, html`<container></container>`);
    h.frame(); // input is off until the first frame has been rendered
    expect(h.stage.eventMode).toBe("static");
    expect(h.stage.hitArea).toEqual(new Rectangle(0, 0, 320, 200));
  });
});

describe("Keyboard", () => {
  const key = (type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}) => new KeyboardEvent(type, { code, bubbles: true, ...init });

  it("reports isDown live and justPressed / justReleased for exactly the frame after the change, by KeyboardEvent.code", async () => {
    const h = harness();
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    const k = got.keyboard!;
    const seen: Array<[boolean, boolean, boolean]> = [];
    h.host.dispatchEvent(key("keydown", "KeyW", { key: "z" })); // layout independent: the code is what counts
    expect(k.isDown("KeyW")).toBe(true);
    h.frame();
    seen.push([k.isDown("KeyW"), k.justPressed("KeyW"), k.justReleased("KeyW")]);
    h.frame();
    seen.push([k.isDown("KeyW"), k.justPressed("KeyW"), k.justReleased("KeyW")]);
    h.host.dispatchEvent(key("keyup", "KeyW"));
    h.frame();
    seen.push([k.isDown("KeyW"), k.justPressed("KeyW"), k.justReleased("KeyW")]);
    h.frame();
    seen.push([k.isDown("KeyW"), k.justPressed("KeyW"), k.justReleased("KeyW")]);
    expect(seen).toEqual([
      [true, true, false],
      [true, false, false],
      [false, false, true],
      [false, false, false],
    ]);
  });

  it("ignores auto-repeat and exposes the held codes as a signal for templates", async () => {
    const h = harness();
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    const k = got.keyboard!;
    h.host.dispatchEvent(key("keydown", "Space"));
    h.host.dispatchEvent(key("keydown", "Space", { repeat: true }));
    h.frame();
    expect(k.justPressed("Space")).toBe(true);
    expect([...k.keys()]).toEqual(["Space"]);
    h.host.dispatchEvent(key("keyup", "Space"));
    expect([...k.keys()]).toEqual([]);
  });

  it("is active only while the host has focus: a keydown elsewhere is ignored, losing focus releases held keys", async () => {
    const h = harness();
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    const k = got.keyboard!;
    window.dispatchEvent(key("keydown", "KeyA"));
    document.body.dispatchEvent(key("keydown", "KeyA"));
    expect(k.isDown("KeyA")).toBe(false);
    h.host.dispatchEvent(key("keydown", "KeyA"));
    expect(k.isDown("KeyA")).toBe(true);
    h.host.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(k.isDown("KeyA")).toBe(false);
    h.frame();
    expect(k.justReleased("KeyA")).toBe(true);
  });

  it("the host takes a tab index and pointer down on the canvas focuses it", async () => {
    const h = harness();
    await mountScene(h, html`<container></container>`);
    expect(h.host.tabIndex).toBe(0);
    expect(document.activeElement).not.toBe(h.host);
    h.canvas.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(document.activeElement).toBe(h.host);
  });

  it("opt-in global mode listens on the window", async () => {
    const h = harness({ keyboard: "global" });
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    window.dispatchEvent(key("keydown", "ArrowLeft"));
    expect(got.keyboard!.isDown("ArrowLeft")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(got.keyboard!.isDown("ArrowLeft")).toBe(false);
  });
});

describe("Gamepad", () => {
  const pad = (index: number, axes: number[], pressed: boolean[]) => ({
    index,
    id: `pad ${index}`,
    mapping: "standard",
    connected: true,
    axes,
    buttons: pressed.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })),
  });

  it("polls once per frame, exposes snapshots, and signals connect and disconnect", async () => {
    let pads: Array<ReturnType<typeof pad> | null> = [];
    const polls = vi.fn(() => pads);
    const h = harness({ getGamepads: polls });
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    const g = got.gamepad!;
    h.frame();
    expect(g.pads()).toEqual([]);
    expect(g.connected()).toBeNull();

    const before = polls.mock.calls.length;
    pads = [pad(0, [0.5, -1], [true, false])];
    h.frame();
    expect(polls.mock.calls.length - before).toBe(1); // once per frame, however many readers
    expect(g.pads()).toHaveLength(1);
    expect(g.pads()[0]).toMatchObject({ index: 0, id: "pad 0", axes: [0.5, -1], buttons: [{ pressed: true }, { pressed: false }] });
    expect(g.connected()?.index).toBe(0);

    pads = [pad(0, [0, 0], [false, false])];
    h.frame();
    expect(g.pads()[0]!.axes).toEqual([0, 0]);
    expect(g.disconnected()).toBeNull();

    pads = [null];
    h.frame();
    expect(g.pads()).toEqual([]);
    expect(g.disconnected()?.index).toBe(0);
  });

  it("snapshots are copies: later hardware changes do not alter a snapshot a scene kept", async () => {
    const live = pad(0, [1], [true]);
    const h = harness({ getGamepads: () => [live] });
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    h.frame();
    const kept = got.gamepad!.pads()[0]!;
    live.axes[0] = -1;
    expect(kept.axes).toEqual([1]);
  });

  it("is a no-op where there is no Gamepad API", async () => {
    const h = harness();
    const { got, Probe } = probe();
    await mountScene(h, html`<scene-probe></scene-probe>`, {}, [Probe]);
    h.frame();
    expect(got.gamepad!.pads()).toEqual([]);
  });
});

describe("DOM and scene separation", () => {
  it("the canvas gets touch-action none by default and the option configures it", async () => {
    const a = harness();
    await mountScene(a, html`<container></container>`);
    expect(a.canvas.style.touchAction).toBe("none");
    document.body.replaceChildren();
    live.pop()!.destroy();
    const b = harness({ touchAction: "pan-y" });
    await mountScene(b, html`<container></container>`);
    expect(b.canvas.style.touchAction).toBe("pan-y");
  });

  it("the scene never prevents default or stops propagation on the DOM event by itself, and sets no pointer capture", async () => {
    const h = harness();
    await mountScene(h, html`<container></container>`);
    const capture = vi.fn();
    (h.canvas as unknown as { setPointerCapture: unknown }).setPointerCapture = capture;
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    const spy = vi.spyOn(down, "stopPropagation");
    h.canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});

// canvas/113 asks to verify three behaviours against Pixi 8 at build time; these tests pin what was found (docs/research/pixi-input-verification.md).
describe("Pixi 8 behaviour the input model relies on", () => {
  it("registers wheel as a passive listener, so a wheel handler cannot preventDefault the page scroll", () => {
    const canvas = document.createElement("canvas");
    const add = vi.spyOn(canvas, "addEventListener");
    const system = new EventSystem({ canvas, resolution: 1, lastObjectRendered: new Container() } as never);
    system.init({});
    const wheel = add.mock.calls.find(([name]) => name === "wheel");
    expect(wheel?.[2]).toMatchObject({ passive: true });
    system.destroy();
  });

  it("never captures the pointer (no setPointerCapture anywhere in its event system)", () => {
    const root = createRequire(import.meta.url).resolve("pixi.js").replace(/lib[\/\\]index.js$/, "lib/events/");
    for (const file of ["EventSystem.js", "EventBoundary.js", "FederatedPointerEvent.js"]) {
      expect(readFileSync(root + file, "utf8")).not.toMatch(/setPointerCapture/);
    }
  });
});
