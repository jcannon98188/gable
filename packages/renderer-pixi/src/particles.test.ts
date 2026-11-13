// The particle tier (TASK-105.18): the <particle-container> tag and the particles() ref helper, on the real Pixi
// renderer and on the scene test renderer, which must agree.
import { ParticleContainer, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createComponent, flushSync, html } from "@gable/core";
import { createPixiRenderer } from "./renderer.js";
import { particles } from "./particles.js";
import { createSceneTestRenderer, SceneNode } from "./testing.js";

const live = () => {
  const pixi = createPixiRenderer();
  const scene = createSceneTestRenderer();
  return [
    { name: "pixi", renderer: pixi as unknown as import("@gable/core/renderer").Renderer<any>, root: pixi.root as unknown },
    { name: "scene test", renderer: scene.renderer as import("@gable/core/renderer").Renderer<any>, root: scene.root as unknown },
  ] as const;
};

describe.each(live())("particle-container on the $name renderer", ({ renderer, root }) => {
  it("is created, and children tags are refused with a pointer to the helper", () => {
    const field = renderer.createElement("particle-container", null);
    renderer.insert(root, field, null);
    expect(() => renderer.insert(field, renderer.createElement("sprite", null), null)).toThrow(/particles\(/);
    expect(() => renderer.insert(field, renderer.createAnchor(), null)).toThrow(/particles\(/);
    // whitespace between tags is ignored, as under any container
    expect(() => renderer.insert(field, renderer.createText("\n  "), null)).not.toThrow();
  });

  it("takes the container properties, a texture property and dynamicProperties", () => {
    const field = renderer.createElement("particle-container", null);
    renderer.setAttribute(field, "x", "10");
    renderer.setProperty(field, "alpha", 0.5);
    renderer.setProperty(field, "dynamicProperties", { rotation: true, color: true });
    expect(() => renderer.setProperty(field, "nope", 1)).toThrow(/Unknown property "nope" on <particle-container>/);
  });

  it("particles(ref) adds, updates and removes particles", () => {
    const field = renderer.createElement("particle-container", null);
    const set = particles(field);
    expect(set.count).toBe(0);
    const a = set.add({ x: 1, y: 2, scaleX: 3, tint: 0xff0000, alpha: 0.5 });
    const b = set.add();
    expect(set.count).toBe(2);
    expect([a.x, a.y, a.scaleX, a.scaleY, a.anchorX, a.rotation, a.tint, a.alpha]).toEqual([1, 2, 3, 1, 0, 0, 0xff0000, 0.5]);
    expect([b.x, b.y, b.scaleX, b.tint, b.alpha]).toEqual([0, 0, 1, 0xffffff, 1]);
    a.x = 50;
    set.update();
    expect([...set.items][0]!.x).toBe(50);
    set.remove(a);
    expect(set.count).toBe(1);
    expect([...set.items]).toEqual([b]);
    set.clear();
    expect(set.count).toBe(0);
  });
});

describe("particles(ref)", () => {
  it("refuses a node that is not a particle-container", () => {
    const pixi = createPixiRenderer();
    expect(() => particles(pixi.createElement("container", null))).toThrow(/particle-container/);
    expect(() => particles({} as never)).toThrow(/particle-container/);
  });

  it("drives a real Pixi ParticleContainer with real Pixi particles", () => {
    const pixi = createPixiRenderer();
    const field = pixi.createElement("particle-container", null) as unknown as ParticleContainer;
    expect(field).toBeInstanceOf(ParticleContainer);
    const set = particles(field);
    const p = set.add({ x: 4 });
    expect(field.particleChildren).toEqual([p]);
    expect(p.texture).toBe(Texture.EMPTY);
    pixi.setProperty(field as never, "texture", Texture.WHITE);
    expect(set.add().texture).toBe(Texture.WHITE);
    expect(field.particleChildren.length).toBe(2);
  });

  it("writes dynamicProperties onto the real container's property flags", () => {
    const pixi = createPixiRenderer();
    const field = pixi.createElement("particle-container", null) as unknown as ParticleContainer & { _properties: Record<string, { dynamic: boolean }> };
    expect(field._properties.rotation!.dynamic).toBe(false);
    pixi.setProperty(field as never, "dynamicProperties", { rotation: true });
    expect(field._properties.rotation!.dynamic).toBe(true);
    expect(() => pixi.setProperty(field as never, "dynamicProperties", { bogus: true })).toThrow(/dynamicProperties/);
  });

  it("the scene test renderer exposes the particles in its data, with the texture by alias", () => {
    const scene = createSceneTestRenderer();
    scene.textures.set("spark", { alias: "spark", width: 4, height: 4 });
    const field = scene.renderer.createElement("particle-container", null);
    scene.renderer.insert(scene.root, field, null);
    scene.renderer.setProperty(field, "texture", "spark");
    const set = particles(field);
    set.add({ x: 3 });
    set.add({ x: 4 });
    const data = scene.find("particle-container")!;
    expect(data.particles).toHaveLength(2);
    expect((data.particles as Array<{ x: number }>).map((p) => p.x)).toEqual([3, 4]);
    expect(field).toBeInstanceOf(SceneNode);
  });
});

describe("in a template", () => {
  it("a <particle-container> tag builds on both renderers (a hyphenated native tag is not an unknown component)", () => {
    const pixi = createPixiRenderer();
    const scene = createSceneTestRenderer();
    class Scene {
      static meta = { selector: "game-scene", template: html`<particle-container label="field" x="7" />` };
    }
    createComponent(Scene as never, { renderer: pixi as never, parent: pixi.root as never });
    createComponent(Scene as never, { renderer: scene.renderer as never, parent: scene.root as never });
    flushSync();
    const real = pixi.root.children[0]!.children[0]!;
    expect(real).toBeInstanceOf(ParticleContainer);
    expect(real.x).toBe(7);
    expect(scene.find("particle-container")!.x).toBe(7);
  });
});
