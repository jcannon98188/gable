import { describe, expect, it } from "vitest";
import { html } from "@gablejs/core";
import { createSceneTestRenderer, mountWithScene } from "@gablejs/renderer-pixi/testing";
import { Rocks, World } from "./entities.js";

// In production the host is <gable-canvas>; the test renderer's boundary stands in for it. The scene components are in
// the host component's OWN template (ADR 0019).
function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Rocks], renderer: scene.boundary, template: html`<game-rocks></game-rocks>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture, world: fixture.injector.get(World)! };
}

describe("guide: entities as components, state in services", () => {
  it("renders one component per entity from the service's list and moves them each frame", () => {
    const { scene, fixture, world } = mount();
    world.spawn(100);
    world.spawn(200);
    fixture.frame(16);
    expect(scene.findAll("sprite#rock")).toHaveLength(2);
    expect(scene.find("sprite#rock")!.x).toBe(100);
    expect(scene.find("sprite#rock")!.y).toBeCloseTo(1.92);
  });

  it("a tap on an entity updates the service, and the entity goes away", () => {
    const { scene, fixture, world } = mount();
    world.spawn(100);
    fixture.frame(16);
    scene.pointer.tap(110, 10);
    fixture.frame(16);
    expect(world.score()).toBe(10);
    expect(scene.findAll("sprite#rock")).toHaveLength(0);
  });
});
