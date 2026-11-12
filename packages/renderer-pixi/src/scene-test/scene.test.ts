import { describe, expect, it } from "vitest";
import { createComponent, flushSync, html, signal } from "@gable/core";
import { createSceneTestRenderer } from "../testing.js";

function build(template: ReturnType<typeof html>, setup: object = {}, options = {}) {
  const scene = createSceneTestRenderer(options);
  class Scene {
    static meta = { selector: "game-scene", template };
  }
  Object.assign(Scene.prototype, setup);
  const ref = createComponent(Scene as never, { renderer: scene.renderer, parent: scene.root });
  return { scene, ref };
}

describe("fixture.scene.find: plain data", () => {
  it("returns position, visibility, alpha, texture and children as plain data", () => {
    const { scene } = build(html`<container label="hud" [x]="10" y="20" [alpha]="0.5" [visible]="false"><sprite label="ship" x="3" /><sprite label="bomb" /></container>`);
    const hud = scene.find("container#hud")!;
    expect(hud).toMatchObject({ tag: "container", label: "hud", x: 10, y: 20, position: { x: 10, y: 20 }, alpha: 0.5, visible: false });
    expect(hud.children.map((c) => c.label)).toEqual(["ship", "bomb"]);
    expect(scene.find("sprite#ship")).toMatchObject({ x: 3, texture: null });
    expect(scene.find("sprite#nope")).toBeNull();
  });

  it("follows signal writes after a flush, one property at a time", () => {
    const x = signal(1);
    const { scene } = build(html`<sprite label="s" [x]="x()" [scale.y]="2" />`, { x });
    expect(scene.find("sprite#s")).toMatchObject({ x: 1, scale: { x: 1, y: 2 } });
    x.set(9);
    flushSync();
    expect(scene.find("sprite#s")!.x).toBe(9);
  });

  it("applies Pixi's point-like, angle and tint semantics", () => {
    const { scene } = build(html`<sprite label="s" scale="2" [pivot]="pivot()" angle="90" tint="#f00" [anchor]="0.5" />`, { pivot: signal({ x: 1, y: 2 }) });
    const s = scene.find("sprite#s")!;
    expect(s.scale).toEqual({ x: 2, y: 2 });
    expect(s.pivot).toEqual({ x: 1, y: 2 });
    expect(s.rotation).toBeCloseTo(Math.PI / 2);
    expect(s.tint).toBe(0xff0000);
    expect(s.props.anchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it("rejects what the Pixi renderer rejects", () => {
    const scene = createSceneTestRenderer();
    const sprite = scene.renderer.createElement("sprite", null);
    expect(() => scene.renderer.setProperty(sprite, "nope", 1)).toThrow(/Unknown property "nope" on <sprite>/);
    expect(() => scene.renderer.createElement("div", null)).toThrow(/Unknown scene tag <div>/);
    expect(() => scene.renderer.setAttribute(sprite, "x", "abc")).toThrow(/expected a number/);
    expect(() => scene.renderer.insert(scene.root, scene.renderer.createText("hi"))).toThrow(/Text content is only allowed/);
  });

  it("collects text content into a text node", () => {
    const n = signal("one");
    const { scene } = build(html`<text label="t">score {{ n() }}</text>`, { n });
    expect(scene.find("text#t")!.text).toBe("score one");
    n.set("two");
    flushSync();
    expect(scene.find("text#t")!.text).toBe("score two");
  });

  it("records graphics shapes as data, in order", () => {
    const { scene } = build(html`<graphics label="g"><rect width="4" height="5" fill="#fff" /><circle radius="3" /></graphics>`);
    expect(scene.find("graphics#g")!.shapes).toMatchObject([{ tag: "rect", width: 4, height: 5 }, { tag: "circle", radius: 3 }]);
  });
});

describe("draw order and world position", () => {
  it("lists children in insertion order and in paint order with zIndex applied", () => {
    const { scene } = build(html`<container label="p"><sprite label="a" zIndex="2" /><sprite label="b" /><sprite label="c" zIndex="2" /></container>`);
    const p = scene.find("container#p")!;
    expect(p.children.map((c) => c.label)).toEqual(["a", "b", "c"]);
    expect(p.drawChildren.map((c) => c.label)).toEqual(["b", "a", "c"]);
    expect(scene.drawOrder().map((n) => n.label)).toEqual(["game-scene", "p", "b", "a", "c"]);
  });

  it("keeps order across @for and @if changes", () => {
    const items = signal(["a", "b", "c"]);
    const show = signal(true);
    const { scene } = build(html`@for (i of items(); track i) { <sprite [label]="i" /> } @if (show()) { <sprite label="tail" /> }`, { items, show });
    const names = () => scene.find("game-scene")!.children.map((c) => c.label);
    expect(names()).toEqual(["a", "b", "c", "tail"]);
    items.set(["c", "a"]);
    show.set(false);
    flushSync();
    expect(names()).toEqual(["c", "a"]);
  });

  it("computes the world position through the parent chain", () => {
    const { scene } = build(html`<container x="100" y="50" scale="2"><sprite label="s" x="10" y="5" /></container>`);
    expect(scene.find("sprite#s")!.world).toEqual({ x: 120, y: 60 });
  });

  it("gives bounds from author-supplied sizes only", () => {
    const { scene } = build(html`<container x="10" y="10"><sprite label="s" width="20" height="10" x="5" [anchor]="0.5" /></container>`);
    expect(scene.bounds("sprite#s")).toEqual({ x: 5, y: 5, width: 20, height: 10 });
    expect(scene.bounds("container")).toBeNull();
  });

  it("supports descendant and child selectors and property selectors", () => {
    const { scene } = build(html`<container label="a"><container label="b"><sprite label="deep" /></container><sprite label="shallow" visible="false" /></container>`);
    expect(scene.findAll("container#a sprite").map((n) => n.label)).toEqual(["deep", "shallow"]);
    expect(scene.findAll("container#a > sprite").map((n) => n.label)).toEqual(["shallow"]);
    expect(scene.findAll("sprite[visible=false]").map((n) => n.label)).toEqual(["shallow"]);
  });
});
