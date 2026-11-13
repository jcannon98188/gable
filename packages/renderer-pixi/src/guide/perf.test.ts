import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { createSceneTestRenderer, mountWithScene } from "@gable/renderer-pixi/testing";
import { Dot, PoseDot, Sparks } from "./perf.js";

function mount(template: ReturnType<typeof html>, imports: unknown[]) {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports, renderer: scene.boundary, template };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  return { scene, fixture: mountWithScene(Page, { scene }) };
}

describe("guide: performance tiers", () => {
  it("tier 1 and 2 entities render as sprites", () => {
    const { scene, fixture } = mount(html`<game-dot></game-dot><game-pose-dot></game-pose-dot>`, [Dot, PoseDot]);
    fixture.frame();
    expect(scene.find("sprite#dot")).not.toBeNull();
    expect(scene.find("sprite#pose")).not.toBeNull();
  });

  it("tier 4 particles are plain records the frame hook writes directly", () => {
    const { scene, fixture } = mount(html`<game-sparks></game-sparks>`, [Sparks]);
    fixture.frames(2, 50); // the first frame builds the set and moves it, the second moves it again
    const container = scene.find("particle-container")!;
    expect(container.particles).toHaveLength(1000);
    expect(container.particles![0]!.y).toBeCloseTo(2 * 40 * 0.05);
  });
});
