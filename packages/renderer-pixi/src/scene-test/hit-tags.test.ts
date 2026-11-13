import { describe, expect, it } from "vitest";
import { createComponent, createInjector, flushSync, html, signal } from "@gable/core";
import { createSceneTestRenderer } from "../testing.js";

// Declarative hit-* children through the scene test renderer (TASK-105.11). The host component has its own template
// (scene components projected into <gable-canvas> cannot inject boundary services, ADR 0019).
function build(template: ReturnType<typeof html>, setup: (self: any) => void = () => {}) {
  const scene = createSceneTestRenderer();
  class Scene {
    static meta = { selector: "game-scene", template };
    _init = setup(this);
  }
  createComponent(Scene as never, { renderer: scene.renderer, parent: scene.root, injector: createInjector([...scene.renderer.providers!]) });
  return scene;
}

describe("hit-* children in a scene", () => {
  it("make a node hittable by the declared shape, not its bounds", () => {
    const hits: string[] = [];
    const scene = build(
      html`<container label="btn" width="100" height="100" (pointerdown)="hit('btn')"><hit-circle x="20" y="20" radius="10" /></container>`,
      (self) => (self.hit = (n: string) => hits.push(n)),
    );
    scene.pointer.down(50, 50); // inside the bounds, outside the circle
    expect(hits).toEqual([]);
    scene.pointer.down(25, 25);
    expect(hits).toEqual(["btn"]);
    expect(scene.hitTest(25, 25)?.label).toBe("btn");
  });

  it("an extra hit area reaches beyond the visual size, and several make a union", () => {
    const hits: string[] = [];
    const scene = build(
      html`<sprite label="icon" width="10" height="10" (pointertap)="hit()"><hit-rect x="-20" y="-20" width="50" height="50" /><hit-rounded-rect x="100" width="10" height="10" radius="2" /><hit-ellipse x="200" halfWidth="5" halfHeight="5" /><hit-polygon [points]="tri" /></sprite>`,
      (self) => {
        self.hit = () => hits.push("tap");
        self.tri = [300, 0, 310, 0, 300, 10];
      },
    );
    for (const [x, y] of [[-15, -15], [105, 5], [200, 0], [301, 1]] as const) scene.pointer.tap(x, y);
    expect(hits).toHaveLength(4);
    scene.pointer.tap(60, 60);
    expect(hits).toHaveLength(4);
  });

  it("update with signals, and disappear with @if", () => {
    const radius = signal(5);
    const on = signal(true);
    const scene = build(
      html`<container label="c" width="100" height="100" eventMode="static">@if (on()) {<hit-circle x="0" y="0" [radius]="radius()" />}</container>`,
      (self) => {
        self.radius = radius;
        self.on = on;
      },
    );
    expect(scene.hitTest(8, 0)).toBeNull();
    radius.set(10);
    flushSync();
    expect(scene.hitTest(8, 0)?.label).toBe("c");
    on.set(false);
    flushSync();
    // No hit children left: the declared size applies again.
    expect(scene.hitTest(8, 0)?.label).toBe("c");
    expect(scene.hitTest(80, 80)?.label).toBe("c");
  });

  it("are readable as plain data and findable by tag", () => {
    const scene = build(html`<container label="c"><hit-rect width="4" height="5" /></container>`);
    const c = scene.find("container")!;
    expect(c.hitShapes).toEqual([expect.objectContaining({ tag: "hit-rect", width: 4, height: 5 })]);
    expect(c.node.hitShapes).toHaveLength(1);
  });

  it("hyphenated scene tags no longer trip core's unknown-component check, but an unknown hyphenated tag still does", () => {
    expect(() => build(html`<container><tiling-sprite /><nine-slice-sprite /><bitmap-text text="x" /></container>`)).not.toThrow();
    expect(() => build(html`<container><hit-cirle radius="3" /></container>`)).toThrow(/Unknown element <hit-cirle>/);
  });

  it("reject unknown properties and listeners with the real renderer's messages", () => {
    expect(() => build(html`<container><hit-rect fill="#fff" /></container>`)).toThrow(/Unknown property "fill" on <hit-rect>/);
    expect(() => build(html`<container><hit-rect (pointerdown)="x()" /></container>`, (s) => (s.x = () => {}))).toThrow(/display nodes/);
  });
});
