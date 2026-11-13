import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { MAX_FRAME_DT } from "@gable/renderer-pixi";
import { createSceneTestRenderer, mountWithScene } from "@gable/renderer-pixi/testing";
import { Clock, Runner } from "./frame.js";

function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Runner], renderer: scene.boundary, template: html`<game-runner></game-runner>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture, clock: fixture.injector.get(Clock)! };
}

describe("guide: the Frame service", () => {
  it("runs frame hooks with dt in seconds and the fixed step at exactly its rate", () => {
    const { scene, fixture, clock } = mount();
    fixture.frames(10, 50); // ten frames of 50 ms: half a second
    expect(clock.x()).toBeCloseTo(50);
    expect(clock.ticks()).toBe(10); // 20 Hz: one step per 50 ms frame
    expect(scene.find("sprite#runner")!.x).toBeCloseTo(50);
  });

  it("clamps a long stall to MAX_FRAME_DT instead of one giant step", () => {
    const { fixture, clock } = mount();
    fixture.frame(2000);
    expect(MAX_FRAME_DT).toBe(0.05);
    expect(clock.x()).toBeCloseTo(100 * MAX_FRAME_DT);
    expect(clock.ticks()).toBe(1);
  });

  it("stops the hooks when the scene is destroyed", () => {
    const { scene, fixture, clock } = mount();
    fixture.frame(50);
    fixture.destroy();
    scene.frame(50);
    expect(clock.ticks()).toBe(1);
  });
});
