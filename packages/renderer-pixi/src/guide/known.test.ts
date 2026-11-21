import { describe, expect, it, vi } from "vitest";
import { html } from "@gablejs/core";
import { createDrag } from "@gablejs/renderer-pixi";
import { createSceneTestRenderer, mountWithScene } from "@gablejs/renderer-pixi/testing";
import { Runner } from "./frame.js";

describe("guide: known behaviours", () => {
  it("(a) a scene component projected into the canvas from a page cannot inject boundary services", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", renderer: scene.boundary, template: html`<slot></slot>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas, Runner], template: html`<game-canvas><game-runner></game-runner></game-canvas>` };
    }
    // Runner injects Frame, but projected content resolves injection in the page injector, where Frame does not exist:
    // the component fails to build (the error goes to the app error handler) and its sprite never appears.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fixture = mountWithScene(Page, { scene });
    fixture.frame();
    expect(scene.find("sprite#runner")).toBeNull();
    errors.mockRestore();
  });

  it("(a) the same component works in the host component's own template", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Runner], renderer: scene.boundary, template: html`<game-runner></game-runner>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    fixture.frame();
    expect(scene.find("sprite#runner")).not.toBeNull();
  });

  it("(c) a press and release inside one flush starts no drag", () => {
    const scene = createSceneTestRenderer();
    const log: string[] = [];
    class Card {
      static meta = { selector: "game-card", template: html`<sprite label="card" width="40" height="40" (pointerdown)="drag.down($event)" />` };
      drag = createDrag({ onStart: () => log.push("start"), onEnd: () => log.push("end") });
    }
    class Canvas {
      static meta = { selector: "game-canvas", imports: [Card], renderer: scene.boundary, template: html`<game-card></game-card>` };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    scene.pointer.down(10, 10);
    scene.pointer.move(60, 10);
    scene.pointer.up(60, 10); // no frame between the press and the release
    fixture.frame();
    expect(log).toEqual([]);
  });

  it("(d) hyphenated scene tags work in templates", () => {
    const scene = createSceneTestRenderer();
    class Canvas {
      static meta = {
        selector: "game-canvas",
        renderer: scene.boundary,
        template: html`<tiling-sprite label="ground" /><graphics label="box"><rounded-rect [width]="10" [height]="10" [radius]="2" /></graphics><sprite label="icon" width="10" height="10"><hit-rect [width]="40" [height]="40" /></sprite><particle-container label="dust" />`,
      };
    }
    class Page {
      static meta = { selector: "app-page", imports: [Canvas], template: html`<game-canvas></game-canvas>` };
    }
    const fixture = mountWithScene(Page, { scene });
    expect(fixture.scene.find("tiling-sprite#ground")).not.toBeNull();
    expect(fixture.scene.find("graphics#box")).not.toBeNull();
    expect(fixture.scene.find("particle-container#dust")).not.toBeNull();
    expect(fixture.scene.find("sprite#icon")!.hitShapes).toHaveLength(1);
  });
});
