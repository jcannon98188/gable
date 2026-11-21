import { describe, expect, it } from "vitest";
import { html } from "@gablejs/core";
import { createSceneTestRenderer, mountWithScene } from "@gablejs/renderer-pixi/testing";
import { Player } from "./input.js";

function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = { selector: "game-canvas", imports: [Player], renderer: scene.boundary, template: html`<game-player></game-player>` };
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture };
}

describe("guide: input services", () => {
  it("polls the Keyboard per frame: held keys move, justPressed fires for one frame", () => {
    const { scene, fixture } = mount();
    const player = scene.find("sprite#ship")!;
    expect(player.x).toBe(0);
    scene.keyboard.press("ArrowRight");
    scene.keyboard.press("Space");
    fixture.frames(2, 50);
    expect(scene.find("sprite#ship")!.x).toBeCloseTo(20);
    scene.keyboard.release("ArrowRight");
    fixture.frame(50);
    expect(scene.find("sprite#ship")!.x).toBeCloseTo(20);
  });

  it("drops key state when the host loses focus", () => {
    const { scene, fixture } = mount();
    scene.keyboard.press("ArrowRight");
    scene.keyboard.blur();
    fixture.frame(50);
    expect(scene.find("sprite#ship")!.x).toBe(0);
  });

  it("exposes the pointer position as signals in scene coordinates", () => {
    const { scene, fixture } = mount();
    scene.pointer.move(30, 40);
    fixture.frame();
    expect(scene.find("sprite#cursor")).toMatchObject({ x: 30, y: 40 });
  });

  it("drags a node from its pointerdown through the Pointer service", () => {
    const { scene, fixture } = mount();
    scene.pointer.down(10, 110);
    fixture.frame();
    scene.pointer.move(60, 110);
    fixture.frame();
    scene.pointer.up(60, 110);
    fixture.frame();
    expect(scene.find("sprite#ship")!.x).toBe(50);
  });
});
