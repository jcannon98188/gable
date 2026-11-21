// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Container, Sprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap, html, inject, signal } from "@gablejs/core";
import { createDomRenderer } from "@gablejs/renderer-dom";
import { CanvasSize, GableCanvas, pixiRenderer, type ApplicationLike, type PixiRendererOptions } from "./index.js";

// A stand-in Application: jsdom has no WebGL. It records what the renderer asked of it.
function fakeApp() {
  const log = { inits: 0, renders: 0, destroyed: 0, resizes: [] as number[][] };
  const stage = new Container();
  const canvas = document.createElement("canvas");
  const app: ApplicationLike = {
    async init() {
      log.inits++;
    },
    canvas,
    stage,
    render() {
      log.renders++;
    },
    renderer: {
      resize(w, h) {
        log.resizes.push([w, h]);
      },
    },
    destroy() {
      log.destroyed++;
      canvas.remove();
    },
  };
  return { app, log, stage, canvas };
}

const live: Array<{ destroy(): void }> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  document.body.replaceChildren();
});

function mountPage(template: ReturnType<typeof html>, setup: object = {}, extra: { imports?: unknown[] } = {}) {
  class Page {
    static meta = { selector: "app-page", template, imports: [GableCanvas, ...(extra.imports ?? [])] };
  }
  Object.assign(Page.prototype, setup);
  const target = document.createElement("div");
  document.body.append(target);
  const ref = bootstrap(Page as never, { renderer: createDomRenderer(), target });
  live.push(ref);
  return { ref, target };
}

const loaded = (fake: ReturnType<typeof fakeApp>) => vi.waitFor(() => expect(fake.canvas.isConnected).toBe(true));

describe("<gable-canvas> host", () => {
  it("renders inline scene content on the canvas through the Pixi renderer", async () => {
    const fake = fakeApp();
    const x = signal(5);
    const options: PixiRendererOptions = { createApplication: () => fake.app };
    const { target } = mountPage(html`<gable-canvas [options]="options"><sprite [x]="x()" y="3"></sprite></gable-canvas>`, { options, x });
    await loaded(fake);
    const root = fake.stage.children[0] as Container;
    const sprite = root.children[0] as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.x).toBe(5);
    expect(sprite.y).toBe(3);
    expect(target.querySelector("gable-canvas canvas")).toBe(fake.canvas);
    await vi.waitFor(() => expect(fake.log.renders).toBeGreaterThan(0));
    expect(fake.log.inits).toBe(1);
  });

  it("works with pixiRenderer(options) as meta.renderer of a host of your own", async () => {
    const fake = fakeApp();
    class MyCanvas {
      static meta = {
        selector: "my-canvas",
        template: html`<container><sprite x="9"></sprite></container>`,
        renderer: pixiRenderer({ createApplication: () => fake.app }),
      };
    }
    mountPage(html`<my-canvas></my-canvas>`, {}, { imports: [MyCanvas] });
    await vi.waitFor(() => expect(fake.stage.children).toHaveLength(1));
    const root = fake.stage.children[0] as Container;
    expect((root.children[0] as Container).children[0]!.x).toBe(9);
  });

  it("a signal write updates only the changed property; dotted paths work", async () => {
    const fake = fakeApp();
    const sx = signal(1);
    const px = signal(10);
    const options = { createApplication: () => fake.app };
    mountPage(html`<gable-canvas [options]="options"><sprite [scale.x]="sx()" [x]="px()" y="7" alpha="0.5"></sprite></gable-canvas>`, { options, sx, px });
    await loaded(fake);
    const sprite = (fake.stage.children[0] as Container).children[0] as Sprite;
    expect([sprite.scale.x, sprite.scale.y, sprite.x]).toEqual([1, 1, 10]);
    // A spy on the properties the other bindings own: they must not be rewritten.
    const writes: string[] = [];
    for (const key of ["y", "alpha"] as const) {
      let v = sprite[key];
      Object.defineProperty(sprite, key, { get: () => v, set: (n) => (writes.push(key), (v = n)) });
    }
    sx.set(4);
    await vi.waitFor(() => expect(sprite.scale.x).toBe(4));
    expect(sprite.scale.y).toBe(1);
    px.set(11);
    await vi.waitFor(() => expect(sprite.x).toBe(11));
    expect(writes).toEqual([]);
  });

  it("shows a placeholder while Pixi loads, and replaces it with the canvas", async () => {
    const fake = fakeApp();
    const options = { createApplication: () => fake.app };
    const { target } = mountPage(html`<gable-canvas [options]="options"><sprite></sprite></gable-canvas>`, { options });
    expect(target.querySelector(".gable-canvas-placeholder")).not.toBeNull();
    expect(target.querySelector("canvas")).toBeNull();
    await loaded(fake);
    expect(target.querySelector(".gable-canvas-placeholder")).toBeNull();
  });

  it("lets the author supply placeholder content in slot=\"placeholder\"", () => {
    const { target } = mountPage(html`<gable-canvas [options]="options"><p slot="placeholder">Loading the game</p></gable-canvas>`, { options: { createApplication: () => fakeApp().app } });
    expect(target.querySelector("p")?.textContent).toBe("Loading the game");
    expect(target.querySelector(".gable-canvas-placeholder")).toBeNull();
  });

  it("keeps pixi.js out of the host module: it is reached only through a dynamic import", () => {
    const src = readFileSync(fileURLToPath(import.meta.url).replace(/host.test.ts$/, "host.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']pixi\.js/);
    expect(src).not.toMatch(/^import(?!\s+type)[^\n]*from\s+["']\.\/(renderer|scene)\.js/m);
    expect(src).toMatch(/import\(\s*["']\.\/scene\.js["']\s*\)/);
  });

  describe("accessibility", () => {
    it("is a role=group element labelled from aria-label", () => {
      const { target } = mountPage(html`<gable-canvas aria-label="Asteroids" [options]="options"></gable-canvas>`, { options: { createApplication: () => fakeApp().app } });
      const host = target.querySelector("gable-canvas")!;
      expect(host.getAttribute("role")).toBe("group");
      expect(host.getAttribute("aria-label")).toBe("Asteroids");
    });

    it("takes its name from aria-labelledby", () => {
      const { target } = mountPage(html`<h2 id="t">Game</h2><gable-canvas aria-labelledby="t" [options]="options"></gable-canvas>`, { options: { createApplication: () => fakeApp().app } });
      const host = target.querySelector("gable-canvas")!;
      expect(host.getAttribute("role")).toBe("group");
      expect(host.getAttribute("aria-labelledby")).toBe("t");
    });

    it("lets the author override the role", () => {
      const { target } = mountPage(html`<gable-canvas role="application" aria-label="Game" [options]="options"></gable-canvas>`, { options: { createApplication: () => fakeApp().app } });
      expect(target.querySelector("gable-canvas")!.getAttribute("role")).toBe("application");
    });
  });

  describe("lifetime", () => {
    it("keeps the Application when scene content is rebuilt", async () => {
      const fake = fakeApp();
      const show = signal(true);
      const options = { createApplication: () => fake.app };
      mountPage(html`<gable-canvas [options]="options">@if (show()) {<sprite x="1"></sprite>}</gable-canvas>`, { options, show });
      await loaded(fake);
      const root = fake.stage.children[0] as Container;
      const first = root.children.find((c) => c instanceof Sprite);
      expect(first).toBeDefined();
      show.set(false);
      await vi.waitFor(() => expect(root.children.find((c) => c instanceof Sprite)).toBeUndefined());
      show.set(true);
      await vi.waitFor(() => expect(root.children.find((c) => c instanceof Sprite)).toBeDefined());
      expect(root.children.find((c) => c instanceof Sprite)).not.toBe(first);
      expect(fake.log.inits).toBe(1);
      expect(fake.log.destroyed).toBe(0);
      expect(fake.stage.children[0]).toBe(root);
    });

    it("destroying the host destroys the renderer's scene and the Application, and stops rendering", async () => {
      const fake = fakeApp();
      const options = { createApplication: () => fake.app };
      const { ref } = mountPage(html`<gable-canvas [options]="options"><container><sprite></sprite></container></gable-canvas>`, { options });
      await loaded(fake);
      const root = fake.stage.children[0] as Container;
      const kids = [...root.children, ...(root.children[0] as Container).children];
      ref.destroy();
      expect(root.destroyed).toBe(true);
      expect(kids.every((k) => k.destroyed)).toBe(true);
      expect(fake.log.destroyed).toBe(1);
      const renders = fake.log.renders;
      await new Promise((r) => setTimeout(r, 60));
      expect(fake.log.renders).toBe(renders);
    });

    it("destroying the host before Pixi has finished loading leaks nothing", async () => {
      const fake = fakeApp();
      const options = { createApplication: () => fake.app };
      const { ref } = mountPage(html`<gable-canvas [options]="options"><sprite></sprite></gable-canvas>`, { options });
      ref.destroy();
      await new Promise((r) => setTimeout(r, 60));
      expect(fake.canvas.isConnected).toBe(false);
      expect(fake.log.renders).toBe(0);
      expect(fake.log.inits - fake.log.destroyed).toBeLessThanOrEqual(0);
    });
  });

  it("provides the canvas size as signals to scene components of a host", async () => {
    const fake = fakeApp();
    const seen: { size?: CanvasSize } = {};
    class Hud {
      static meta = { selector: "scene-hud", template: html`<container></container>` };
      size = (seen.size = inject(CanvasSize));
    }
    class MyCanvas {
      static meta = {
        selector: "my-canvas",
        imports: [Hud],
        template: html`<scene-hud></scene-hud>`,
        renderer: pixiRenderer({ createApplication: () => fake.app, width: 640, height: 480 }),
      };
    }
    mountPage(html`<my-canvas></my-canvas>`, {}, { imports: [MyCanvas] });
    await loaded(fake);
    expect(seen.size!.width()).toBe(640);
    expect(seen.size!.height()).toBe(480);
    expect(seen.size!.pixelRatio()).toBeGreaterThan(0);
  });
});
