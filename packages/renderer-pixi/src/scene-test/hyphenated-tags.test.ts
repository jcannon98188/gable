import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { createSceneTestRenderer, mountWithScene } from "../testing.js";

// Scene tags with a hyphen (rounded-rect, tiling-sprite, nine-slice-sprite, bitmap-text) must be usable in templates:
// core's dev "Unknown element" check asks the renderer before demanding a component import.
describe("hyphenated scene tags in templates", () => {
  it("builds tiling-sprite, nine-slice-sprite, bitmap-text and a rounded-rect shape from a template", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = {
        selector: "game-canvas",
        renderer: scene.boundary,
        template: html`<container label="root"><tiling-sprite label="bg" /><nine-slice-sprite label="panel" /><bitmap-text label="score" /><graphics label="g"><rounded-rect [width]="10" [height]="10" [radius]="2" /></graphics></container>`,
      };
    }
    class App {
      static meta = { selector: "app-root", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(App, { scene });
    expect(fixture.scene.find("tiling-sprite#bg")).toBeTruthy();
    expect(fixture.scene.find("nine-slice-sprite#panel")).toBeTruthy();
    expect(fixture.scene.find("bitmap-text#score")).toBeTruthy();
  });

  it("still reports an unknown hyphenated tag that is neither a scene tag nor an imported component", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", renderer: scene.boundary, template: html`<container><not-a-thing /></container>` };
    }
    class App {
      static meta = { selector: "app-root", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    expect(() => mountWithScene(App, { scene })).toThrow(/Unknown element <not-a-thing>/);
  });
});
