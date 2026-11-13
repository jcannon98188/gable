import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { createSceneTestRenderer, mountWithScene, provideTestAssets } from "@gable/renderer-pixi/testing";
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
});
