import { describe, expect, it } from "vitest";
import { createComponent, createInjector, flushSync, html, inject, whenFlushed } from "@gablejs/core";
import { Assets } from "../index.js";
import { createSceneTestRenderer, provideTestAssets } from "../testing.js";

const BUNDLES = { level1: [{ alias: "ship", src: "ship.png" }], menu: [{ alias: "logo", src: "logo.png" }] };
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const scene = createSceneTestRenderer();
  const assets = provideTestAssets({ bundles: BUNDLES, textures: scene.textures });
  const injector = createInjector([...assets.providers, ...scene.renderer.providers!]);
  const service = injector.run(() => inject(Assets));
  return { scene, assets, injector, service };
}

function inScene(env: ReturnType<typeof setup>, template: ReturnType<typeof html>, body: (self: any) => void) {
  class Level {
    static meta = { selector: "game-level", template };
    _init = body(this);
  }
  return createComponent(Level as never, { injector: env.injector, renderer: env.scene.renderer, parent: env.scene.root });
}

describe("provideTestAssets", () => {
  it("replaces the Assets service: bundles are instantly ready by default with stub textures", async () => {
    const env = setup();
    const level = env.service.bundle("level1");
    expect(level.status()).toBe("idle");
    await level.load();
    expect(level.ready()).toBe(true);
    expect(level.progress()).toBe(1);
    expect(env.scene.textures.get("ship")).toEqual({ alias: "ship", width: 1, height: 1 });
  });

  it("gates a scene on @if (bundle.ready()) and resolves texture aliases from the stub textures", async () => {
    const env = setup();
    const ref = inScene(env, html`@if (level.ready()) { <sprite label="ship" texture="ship" /> }`, (self) => {
      self.level = inject(Assets).bundle("level1");
      void self.level.load();
    });
    expect(env.scene.find("sprite#ship")).toBeNull();
    await tick();
    flushSync();
    expect(env.scene.find("sprite#ship")!.texture).toMatchObject({ alias: "ship" });
    ref.destroy();
  });

  it("scripts loading and progress: setStatus('loading', p) holds the load, setStatus('ready') finishes it", async () => {
    const env = setup();
    const script = env.assets.bundle("level1");
    script.setStatus("loading", 0);
    const level = env.service.bundle("level1");
    const done = level.load();
    expect(level.status()).toBe("loading");
    script.setStatus("loading", 0.4);
    expect(level.progress()).toBe(0.4);
    expect(level.ready()).toBe(false);
    script.setStatus("ready");
    await done;
    expect(level.ready()).toBe(true);
    expect(env.scene.textures.has("ship")).toBe(true);
  });

  it("scripts failure: fail(error) rejects the in-flight load and surfaces on the handle", async () => {
    const env = setup();
    const script = env.assets.bundle("level1");
    script.setStatus("loading");
    const level = env.service.bundle("level1");
    const done = level.load();
    const boom = new Error("404 ship.png");
    script.fail(boom);
    await expect(done).rejects.toBe(boom);
    expect(level.status()).toBe("error");
    expect(level.error()).toBe(boom);
    expect(env.scene.textures.has("ship")).toBe(false);
  });

  it("fail(error) before the load arms the next load", async () => {
    const env = setup();
    env.assets.bundle("menu").fail(new Error("offline"));
    const menu = env.service.bundle("menu");
    await expect(menu.load()).rejects.toThrow("offline");
    expect(menu.status()).toBe("error");
  });

  it("asserts that a bundle is released when the scope that loaded it is disposed", async () => {
    const env = setup();
    const ref = inScene(env, html``, (self) => {
      void inject(Assets).bundle("level1").load();
    });
    await tick();
    env.assets.bundle("level1").expectLoaded();
    expect(() => env.assets.bundle("level1").expectReleased()).toThrow(/still loaded/);
    ref.destroy();
    await tick();
    await whenFlushed();
    env.assets.bundle("level1").expectReleased();
    expect(env.assets.bundle("level1").unloads).toBe(1);
    expect(env.scene.textures.has("ship")).toBe(false);
  });

  it("keepAlive loads are not released by a scope's disposal", async () => {
    const env = setup();
    const ref = inScene(env, html``, () => {
      void inject(Assets).bundle("menu").load({ keepAlive: true });
    });
    await tick();
    ref.destroy();
    await tick();
    env.assets.bundle("menu").expectLoaded();
  });

  it("rejects bundles that were not declared, like production", () => {
    const env = setup();
    expect(() => env.service.bundle("nope")).toThrow(/Unknown bundle "nope"/);
    expect(() => env.assets.bundle("nope")).toThrow(/Unknown bundle "nope"/);
  });

  it("lets a test set the stub texture size", async () => {
    const env = setup();
    env.assets.stubTexture("ship", { width: 64, height: 32 });
    await env.service.bundle("level1").load();
    expect(env.scene.textures.get("ship")).toEqual({ alias: "ship", width: 64, height: 32 });
  });
});
