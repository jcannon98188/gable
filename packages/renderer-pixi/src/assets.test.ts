// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createInjector, createComponent, html, inject, whenFlushed } from "@gable/core";
import { createDomRenderer } from "@gable/renderer-dom";
import { Assets, provideAssets, type AssetsBackend, type BundleHandle } from "./assets.js";

/** A scripted backend: loads settle when the test says so. */
function fakeBackend() {
  const log = { added: [] as string[], unloaded: [] as string[], loads: [] as string[] };
  const pending = new Map<string, { resolve(): void; reject(e: unknown): void; progress(n: number): void }>();
  const backend: AssetsBackend = {
    addBundle(name) {
      log.added.push(name);
    },
    loadBundle(name, onProgress) {
      log.loads.push(name);
      return new Promise<void>((resolve, reject) => {
        pending.set(name, { resolve, reject, progress: onProgress ?? (() => {}) });
      });
    },
    unloadBundle(name) {
      log.unloaded.push(name);
      return Promise.resolve();
    },
  };
  return { backend, log, pending };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const BUNDLES = { menu: [{ alias: "logo", src: "logo.png" }], level1: [{ alias: "ship", src: "ship.png" }] };

function setup() {
  const fake = fakeBackend();
  const injector = createInjector(provideAssets({ bundles: BUNDLES, backend: fake.backend }));
  const assets = injector.run(() => inject(Assets));
  return { ...fake, injector, assets };
}

/** A component whose Setup runs `body`, so the load is tied to its scope. */
function inScope(injector: ReturnType<typeof createInjector>, body: () => void) {
  class Scene {
    static meta = { selector: "x-scene", template: html`` };
    #run = body();
  }
  return createComponent(Scene, { injector, renderer: createDomRenderer(), parent: document.body });
}

describe("Assets service", () => {
  it("returns the same handle for a name, with status, progress, error, load and unload", () => {
    const { assets } = setup();
    const h = assets.bundle("level1");
    expect(assets.bundle("level1")).toBe(h);
    expect(h.status()).toBe("idle");
    expect(h.progress()).toBe(0);
    expect(h.error()).toBeNull();
    expect(typeof h.load).toBe("function");
    expect(typeof h.unload).toBe("function");
  });

  it("throws a dev error naming an unknown bundle", () => {
    const { assets } = setup();
    expect(() => assets.bundle("nope")).toThrow(/nope.*menu, level1|Unknown bundle "nope"/);
  });

  it("tracks loading, progress and ready", async () => {
    const { assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const done = h.load();
    expect(h.status()).toBe("loading");
    pending.get("level1")!.progress(0.5);
    expect(h.progress()).toBe(0.5);
    pending.get("level1")!.resolve();
    await done;
    expect(h.status()).toBe("ready");
    expect(h.progress()).toBe(1);
    expect(log.added).toEqual(["level1"]);
  });

  it("load() is idempotent: one backend load, the same promise", async () => {
    const { assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const a = h.load();
    const b = h.load();
    expect(a).toBe(b);
    pending.get("level1")!.resolve();
    await a;
    await h.load();
    expect(log.loads).toEqual(["level1"]);
  });

  it("surfaces a failed load on the error signal and allows a retry", async () => {
    const { assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const p = h.load();
    const boom = new Error("404");
    pending.get("level1")!.reject(boom);
    await expect(p).rejects.toBe(boom);
    expect(h.status()).toBe("error");
    expect(h.error()).toBe(boom);
    const again = h.load();
    expect(h.status()).toBe("loading");
    expect(h.error()).toBeNull();
    pending.get("level1")!.resolve();
    await again;
    expect(log.loads).toEqual(["level1", "level1"]);
  });

  it("unload() unloads a ready bundle and returns it to idle; unload() on idle is a no-op", async () => {
    const { assets, pending, log } = setup();
    const h = assets.bundle("level1");
    await h.unload();
    expect(log.unloaded).toEqual([]);
    const p = h.load();
    pending.get("level1")!.resolve();
    await p;
    await h.unload();
    expect(log.unloaded).toEqual(["level1"]);
    expect(h.status()).toBe("idle");
  });
});

describe("bundle lifetime", () => {
  const ready = async (h: BundleHandle, pending: ReturnType<typeof setup>["pending"]) => {
    pending.get("level1")!.resolve();
    await tick();
  };

  it("unloads when the last loading scope is disposed", async () => {
    const { injector, assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const a = inScope(injector, () => void h.load());
    const b = inScope(injector, () => void h.load());
    await ready(h, pending);
    a.destroy();
    await tick();
    expect(log.unloaded).toEqual([]);
    expect(h.status()).toBe("ready");
    b.destroy();
    await tick();
    expect(log.unloaded).toEqual(["level1"]);
    expect(h.status()).toBe("idle");
  });

  it("keepAlive opts a load out of scope-bound unloading", async () => {
    const { injector, assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const a = inScope(injector, () => void h.load({ keepAlive: true }));
    await ready(h, pending);
    a.destroy();
    await tick();
    expect(log.unloaded).toEqual([]);
    expect(h.status()).toBe("ready");
  });

  it("a load outside any scope is never auto-unloaded", async () => {
    const { assets, pending, log } = setup();
    const h = assets.bundle("level1");
    void h.load();
    await ready(h, pending);
    expect(log.unloaded).toEqual([]);
  });

  it("a scope disposed after an explicit unload() does not unload again or go negative", async () => {
    const { injector, assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const a = inScope(injector, () => void h.load());
    await ready(h, pending);
    await h.unload();
    a.destroy();
    await tick();
    expect(log.unloaded).toEqual(["level1"]);
    // A fresh load/dispose cycle still balances.
    const b = inScope(injector, () => void h.load());
    pending.get("level1")!.resolve();
    await tick();
    b.destroy();
    await tick();
    expect(log.unloaded).toEqual(["level1", "level1"]);
  });

  it("a scope disposed while the bundle is still loading unloads it once it settles", async () => {
    const { injector, assets, pending, log } = setup();
    const h = assets.bundle("level1");
    const a = inScope(injector, () => void h.load());
    a.destroy();
    pending.get("level1")!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(log.unloaded).toEqual(["level1"]);
    expect(h.status()).toBe("idle");
  });
});

describe("loading UI over the handle's signals", () => {
  it("an @if over ready() swaps the loading UI for the scene", async () => {
    const { injector, pending, assets } = setup();
    class Level {
      static meta = {
        selector: "x-level",
        template: html`@if (level.ready()) {<b>go</b>} @else {<i>loading</i>}`,
      };
      level = assets.bundle("level1");
    }
    const ref = createComponent(Level, { injector, renderer: createDomRenderer(), parent: document.body });
    expect(ref.host.textContent).toContain("loading");
    const p = ref.instance.level.load();
    pending.get("level1")!.resolve();
    await p;
    await whenFlushed();
    expect(ref.host.textContent).toContain("go");
    ref.destroy();
  });
});
