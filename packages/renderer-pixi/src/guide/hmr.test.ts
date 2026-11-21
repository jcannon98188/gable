import { describe, expect, it } from "vitest";
import { html, inject } from "@gablejs/core";
import { createSceneTestRenderer, mountWithScene } from "@gablejs/renderer-pixi/testing";
import { SpawnState, Spawner } from "./hmr.js";

function mount() {
  const scene = createSceneTestRenderer();
  class Canvas {
    static meta = {
      selector: "game-canvas",
      imports: [Spawner],
      renderer: scene.boundary,
      template: html`@if (state.show()) {<game-spawner></game-spawner>}`,
    };
    state = inject(SpawnState);
  }
  class Page {
    static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
  }
  const fixture = mountWithScene(Page, { scene });
  return { scene, fixture, state: fixture.injector.get(SpawnState)! };
}

describe("guide: HMR rules", () => {
  it("a rebuilt scene keeps the service's state and does not double the hook", () => {
    const { fixture, state } = mount();
    fixture.frames(10, 50); // 2 Hz at 50 ms frames: one spawn per 10 frames
    expect(state.spawned()).toBe(1);

    // A rebuild is the old component's scope ending and a new instance starting.
    state.show.set(false);
    fixture.frame(50);
    state.show.set(true);
    fixture.frames(10, 50);
    // The accumulator lives in the Frame service, so time debt carries over, and only one hook runs.
    expect(state.spawned()).toBe(2);
  });

  it("registers nothing on a destroyed scene", () => {
    const { scene, fixture, state } = mount();
    fixture.destroy();
    scene.frames(20, 50);
    expect(state.spawned()).toBe(0);
  });
});
