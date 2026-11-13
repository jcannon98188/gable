import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { createSceneTestRenderer, mountWithScene } from "@gable/renderer-pixi/testing";
import { Hud, Score } from "./a11y.js";

function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Hud], renderer: scene.boundary, template: html`<game-hud></game-hud>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  // The scene test renderer provides ReducedMotion like the real boundary; flip it through `scene.services.reducedMotion`.
  const motion = scene.services.reducedMotion;
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture, motion };
}

describe("guide: accessibility", () => {
  it("mirrors a tagged node as a focusable button and leaves untagged nodes out", () => {
    const { scene, fixture } = mount();
    fixture.frame();
    expect(scene.a11y().map((e) => ({ role: e.role, label: e.label, focusable: e.focusable }))).toEqual([{ role: "button", label: "Start game", focusable: true }]);
  });

  it("tabs into the mirror, activates it with Enter, and leaves again (no trap)", () => {
    const { scene, fixture } = mount();
    fixture.frame();
    expect(scene.tab()).not.toBeNull();
    expect(scene.focused).not.toBe("host");
    scene.press("Enter");
    fixture.frame();
    expect(fixture.injector.get(Score)!.points()).toBe(1);
    expect(scene.tab()).toBeNull(); // the only tab stop is behind us: focus has left the canvas
  });

  it("exposes the reduced-motion setting as a signal the scene reads", () => {
    const { scene, fixture, motion } = mount();
    fixture.frame();
    expect(scene.find("sprite#shaker")!.x).toBe(5);
    motion.reduced.set(true);
    fixture.frame();
    expect(scene.find("sprite#shaker")!.x).toBe(0);
  });

  it("announces a score change through the LiveAnnouncer", () => {
    const { fixture, scene } = mount();
    fixture.frame();
    scene.click("sprite#start");
    fixture.frame();
    expect(fixture.announcer.messages).toEqual([{ message: "Score 1", politeness: "polite" }]);
  });
});
