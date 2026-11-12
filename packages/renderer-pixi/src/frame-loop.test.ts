// @vitest-environment jsdom
// The frame loop of a canvas boundary, driven by a manual scheduler: no real timers, no real rAF.
import { Container, Sprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap, flushSync, html, inject, signal } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { createPixiRenderer, Frame, GableCanvas, pixiRenderer, type ApplicationLike, type FrameScheduler, type PixiRendererOptions } from "./index.js";

function harness() {
  const log: string[] = [];
  const stage = new Container();
  const canvas = document.createElement("canvas");
  const probe: { sprite?: Sprite } = {};
  let renders = 0;
  const app: ApplicationLike = {
    async init() {},
    canvas,
    stage,
    render() {
      renders++;
      log.push(`render x=${probe.sprite?.x}`);
    },
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
    log,
    probe,
    stage,
    canvas,
    options: { createApplication: () => app, scheduler } as PixiRendererOptions,
    get renders() {
      return renders;
    },
    /** One animation frame `ms` after the previous one. */
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
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

async function mount(h: Harness, template: ReturnType<typeof html>, setup: object = {}, imports: unknown[] = []) {
  class Page {
    static meta = { selector: "app-page", template, imports: [GableCanvas, ...imports] };
  }
  Object.assign(Page.prototype, { options: h.options, ...setup });
  const target = document.createElement("div");
  document.body.append(target);
  live.push(bootstrap(Page as never, { renderer: createDomRenderer(), target }));
  await vi.waitFor(() => expect(h.canvas.isConnected).toBe(true));
  await vi.waitFor(() => expect(h.scheduled).toBe(true));
  return live[live.length - 1]!;
}

// A canvas host of the test's own: its template is the scene, so components in it can inject what the boundary provides.
async function mountScene(h: Harness, scene: ReturnType<typeof html>, setup: object = {}, imports: unknown[] = [], renderMode: "always" | "on-demand" = "always") {
  class Scene {
    static meta = { selector: "test-canvas", template: scene, imports, renderer: pixiRenderer({ ...h.options, renderMode }) };
  }
  Object.assign(Scene.prototype, setup);
  return mount(h, html`<test-canvas></test-canvas>`, {}, [Scene]);
}

// A scene component that registers hooks through the Frame service, as an author would.
function sceneWith(register: (frame: Frame) => void, selector = "scene-actor") {
  class Actor {
    static meta = { selector, template: html`<container></container>` };
    frame = (register(inject(Frame)), 0);
  }
  return Actor;
}

describe("frame loop", () => {
  it("runs inject(Frame) hooks each frame and removes them with the component scope", async () => {
    const h = harness();
    const dts: number[] = [];
    const Actor = sceneWith((f) => f.onFrame((dt) => dts.push(dt)));
    const show = signal(true);
    await mountScene(h, html`@if (show()) {<scene-actor></scene-actor>}`, { show }, [Actor]);
    h.frame(16);
    h.frame(16);
    expect(dts).toHaveLength(2);
    expect(dts[1]).toBeCloseTo(0.016);
    show.set(false);
    flushSync();
    h.frame(16);
    expect(dts).toHaveLength(2);
  });

  it("each frame runs hooks, then the effect flush, then exactly one render", async () => {
    const h = harness();
    const x = signal(0);
    const Actor = sceneWith((f) => f.onFrame(() => (h.log.push("hook"), x.set(x() + 1))));
    await mountScene(h, html`<scene-actor></scene-actor><sprite #s [x]="x()"></sprite>`, { x }, [Actor]);
    h.probe.sprite = h.stage.children[0]!.children.find((c) => c instanceof Sprite) as Sprite;
    h.log.length = 0;
    const before = h.renders;
    h.frame();
    // The render of this frame already shows the value the hook wrote.
    expect(h.log).toEqual(["hook", "render x=1"]);
    expect(h.renders - before).toBe(1);
    h.frame();
    expect(h.log).toEqual(["hook", "render x=1", "hook", "render x=2"]);
  });

  it("clamps the dt a hook sees after a long stall", async () => {
    const h = harness();
    const dts: number[] = [];
    const Actor = sceneWith((f) => f.onFrame((dt) => dts.push(dt)));
    await mountScene(h, html`<scene-actor></scene-actor>`, {}, [Actor]);
    h.frame(16); // the first frame only sets the clock
    h.frame(5000);
    expect(dts.at(-1)).toBeCloseTo(0.05);
  });

  it("onFixedStep: 100 ms of frames yields six 60 Hz steps", async () => {
    const h = harness();
    let steps = 0;
    const Actor = sceneWith((f) => f.onFixedStep(60, () => steps++));
    await mountScene(h, html`<scene-actor></scene-actor>`, {}, [Actor]);
    h.frame(0); // the first frame only establishes the clock
    steps = 0;
    h.frame(50);
    h.frame(50);
    expect(steps).toBe(6);
  });

  it("stops requesting frames once the host is destroyed", async () => {
    const h = harness();
    const ref = await mount(h, html`<gable-canvas [options]="options"><sprite></sprite></gable-canvas>`);
    h.frame();
    ref.destroy();
    expect(h.scheduled).toBe(false);
  });

  describe("renderMode", () => {
    it("renders every frame by default", async () => {
      const h = harness();
      await mount(h, html`<gable-canvas [options]="options"><sprite></sprite></gable-canvas>`);
      const before = h.renders;
      h.frame();
      h.frame();
      h.frame();
      expect(h.renders - before).toBe(3);
    });

    it("'on-demand' renders only after a signal write reaches the scene", async () => {
      const h = harness();
      const x = signal(0);
      await mount(h, html`<gable-canvas renderMode="on-demand" [options]="options"><sprite [x]="x()"></sprite></gable-canvas>`, { x });
      h.frame(); // settle the first render
      const before = h.renders;
      h.frame();
      h.frame();
      expect(h.renders).toBe(before);
      x.set(5);
      h.frame();
      expect(h.renders).toBe(before + 1);
      h.frame();
      expect(h.renders).toBe(before + 1);
    });

    it("'on-demand' renders after a hook wrote to the scene", async () => {
      const h = harness();
      const x = signal(0);
      const Actor = sceneWith((f) => f.onFrame(() => x.set(x() + 1)));
      await mountScene(h, html`<scene-actor></scene-actor><sprite [x]="x()"></sprite>`, { x }, [Actor], "on-demand");
      h.frame();
      const before = h.renders;
      h.frame();
      h.frame();
      expect(h.renders - before).toBe(2);
    });
  });

  describe("invalidate", () => {
    it("lets input mark the scene dirty so an on-demand renderer draws the next frame", async () => {
      const h = harness();
      const r = createPixiRenderer({ ...h.options, renderMode: "on-demand" });
      await r.mount(document.createElement("div"));
      h.frame();
      const before = h.renders;
      h.frame();
      expect(h.renders).toBe(before);
      r.invalidate();
      h.frame();
      expect(h.renders).toBe(before + 1);
      r.destroy();
    });
  });

  describe("rebuilds", () => {
    it("a rebuild during a frame takes effect at the next frame; accumulators survive it", async () => {
      const h = harness();
      const show = signal(true);
      const ran: string[] = [];
      let generation = 0;
      const Toggler = sceneWith((f) => f.onFrame(() => show.set(!show())), "scene-toggler");
      const Actor = sceneWith((f) => {
        const id = "g" + ++generation;
        f.onFixedStep(10, () => ran.push(id + ":step"));
        f.onFrame(() => ran.push(id + ":frame"));
      });
      await mountScene(
        h,
        html`<scene-toggler></scene-toggler>@if (show()) {<scene-actor></scene-actor>}`,
        { show },
        [Actor, Toggler],
      );
      h.frame(0); // clock only; the toggler hides the actor
      h.frame(50); // the toggler shows it again: g2 is built in this frame's flush
      expect(ran).not.toContain("g2:frame");
      ran.length = 0;
      h.frame(50); // g2 runs now; the accumulator kept 50 ms across the rebuild, so 100 ms is one 10 Hz step
      expect(ran).toEqual(["g2:frame", "g2:step"]);
    });
  });
});
