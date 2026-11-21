import { describe, expect, it } from "vitest";
import { html, inject } from "@gablejs/core";
import { Assets } from "@gablejs/renderer-pixi";
import { createSceneTestRenderer, mountWithScene, provideTestAssets } from "@gablejs/renderer-pixi/testing";
import { Level } from "./assets.js";

// In tests, provideTestAssets replaces the asset system under the real Assets service, so the handle's signals and the
// scope counting run as in production. The bundle waits until the test says so.
function mount() {
  const scene = createSceneTestRenderer();
  const assets = provideTestAssets({ bundles: { level1: [{ alias: "ship", src: "ship.png" }] }, textures: scene.textures });
  const level1 = assets.bundle("level1");
  level1.setStatus("loading", 0.25);
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Level], renderer: scene.boundary, template: html`<game-level></game-level>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene, assets });
  return { scene, fixture, level1 };
}

describe("guide: assets and loading UI", () => {
  it("shows a progress bar while loading, then the scene once ready", async () => {
    const { scene, fixture, level1 } = mount();
    fixture.frame();
    expect(scene.find("graphics#loading")).not.toBeNull();
    expect(scene.find("sprite#ship")).toBeNull();
    level1.setStatus("ready");
    await fixture.settle();
    fixture.frame();
    expect(scene.find("graphics#loading")).toBeNull();
    expect(scene.find("sprite#ship")).not.toBeNull();
  });

  it("shows the error state when the bundle fails", async () => {
    const { scene, fixture, level1 } = mount();
    level1.fail(new Error("404"));
    await fixture.settle();
    fixture.frame();
    expect(scene.find("text#failed")).not.toBeNull();
  });

  it("unloads the bundle when the scene that loaded it is destroyed", async () => {
    const { fixture, level1 } = mount();
    level1.setStatus("ready");
    await fixture.settle();
    level1.expectLoaded();
    fixture.destroy();
    await fixture.settle();
    level1.expectReleased();
  });

  // docs/canvas.md: `@defer (when level.ready()) { <game-world></game-world> }` keeps the heavy part of a scene out until the assets are in.
  it("renders a @defer (when ...) block of the scene once the bundle is ready", async () => {
    const scene = createSceneTestRenderer();
    const assets = provideTestAssets({ bundles: { level1: [{ alias: "ship", src: "ship.png" }] }, textures: scene.textures });
    const level1 = assets.bundle("level1");
    level1.setStatus("loading", 0.1);
    class World {
      static meta = { selector: "game-world", template: html`<sprite label="world" texture="ship" />` };
    }
    class Gate {
      static meta = { selector: "game-gate", imports: [World], template: html`@defer (when level.ready()) { <game-world></game-world> }` };
      level = inject(Assets).bundle("level1");
      start = this.level.load().catch(() => {});
    }
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Gate], renderer: scene.boundary, template: html`<game-gate></game-gate>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene, assets });
    fixture.frame();
    await fixture.settle();
    fixture.frame();
    expect(scene.find("sprite#world")).toBeNull();
    level1.setStatus("ready");
    await fixture.settle();
    fixture.frame();
    expect(scene.find("sprite#world")).not.toBeNull();
  });
});
