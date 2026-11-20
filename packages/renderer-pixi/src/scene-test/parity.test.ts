// Parity suite (canvas/115 item 2c): the same templates are built with the real Pixi renderer in Node and with the scene
// test renderer, and every property and the child order must agree, so the double cannot drift from Pixi. Excluded: Text
// (it measures through a canvas, which Node lacks) and rendering itself.
import "pixi.js/events";
import { Container, Graphics, NineSliceSprite, ParticleContainer, Sprite, Texture, TilingSprite } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, flushSync, html, signal, type ComponentRef } from "@gable/core";
import { isSceneTag, propertiesOf, type SceneTagName } from "../elements.js";
import { particles } from "../particles.js";
import { createPixiRenderer } from "../renderer.js";
import { createSceneTestRenderer, type SceneNode } from "../testing.js";

/** Pixi class names are mangled (`_TilingSprite`), so classify by instanceof; TilingSprite is not a Sprite in Pixi 8, but check specific classes first. */
function pixiTagOf(p: Container): SceneTagName {
  if (p instanceof TilingSprite) return "tiling-sprite";
  if (p instanceof NineSliceSprite) return "nine-slice-sprite";
  if (p instanceof Sprite) return "sprite";
  if (p instanceof Graphics) return "graphics";
  if (p instanceof ParticleContainer) return "particle-container";
  return "container";
}
// Pixi computes these from content (bounds, text measurement), which the double does not model.
const SKIP = new Set(["width", "height", "style", "text", "context", "filters", "mask", "dynamicProperties"]);
const POINTS = new Set(["position", "scale", "pivot", "skew", "anchor", "tilePosition", "tileScale"]);
const ANCHOR = "#anchor";

const live: Array<ComponentRef<any, any>> = [];
afterEach(() => {
  while (live.length) live.pop()!.destroy();
  vi.restoreAllMocks();
});

/** Builds `template` once per renderer, with the same component state. */
function both(template: ReturnType<typeof html>, state: Record<string, unknown> = {}) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const make = (r: ReturnType<typeof createPixiRenderer> | ReturnType<typeof createSceneTestRenderer>["renderer"], root: unknown) => {
    class Scene {
      static meta = { selector: "game-scene", template };
    }
    Object.assign(Scene.prototype, state);
    live.push(createComponent(Scene as never, { renderer: r as never, parent: root as never }));
  };
  const pixi = createPixiRenderer();
  make(pixi, pixi.root);
  const scene = createSceneTestRenderer();
  make(scene.renderer, scene.root);
  flushSync();
  return { pixiRoot: pixi.root, sceneRoot: scene.root, pixi, scene };
}

function sameTree(p: Container, s: SceneNode, path = "root"): void {
  const pk = p.children.filter((c) => c.label !== ANCHOR) as Container[];
  const sk = s.children.filter((c) => c.kind === "node");
  expect(pk.map((c) => c.label), `${path}: child labels in order`).toEqual(sk.map((c) => c.label));
  expect(pk.length, `${path}: child count`).toBe(sk.length);
  pk.forEach((pc, i) => sameNode(pc, sk[i]!, `${path}/${i}`));
  // The anchors a view keeps are Pixi containers too; they must sit in the same positions relative to real children.
  expect(p.children.map((c) => (c.label === ANCHOR ? "#" : "n")).join(""), `${path}: anchor positions`).toBe(s.children.map((c) => (c.kind === "anchor" ? "#" : "n")).join(""));
}

function sameNode(p: Container, s: SceneNode, path: string): void {
  const pixiTag = pixiTagOf(p);
  // A component host element is a plain container on the Pixi side; the double keeps its selector as the tag.
  expect(pixiTag, `${path}: class`).toBe(isSceneTag(s.tag) ? s.tag : "container");
  const props = propertiesOf(pixiTag);
  for (const name of Object.keys(props)) {
    if (SKIP.has(name)) continue;
    const pv = (p as any)[name];
    if (name === "texture") {
      expect(s.rawProperty(name) ?? null === null, `${path}.${name}`).toBeTruthy();
      expect(pv === Texture.EMPTY || pv == null, // a ParticleContainer starts with no texture
         `${path}.${name} is empty`).toBe(true);
      continue;
    }
    if (pv === undefined && s.rawProperty(name) === undefined) continue;
    const sv = s.rawProperty(name);
    if (POINTS.has(name)) expect({ x: sv && (sv as any).x, y: sv && (sv as any).y }, `${path}.${name}`).toEqual({ x: pv.x, y: pv.y });
    else if (name === "label") expect(sv ?? null, `${path}.${name}`).toEqual(pv ?? null);
    else if (name === "angle" || name === "rotation") expect(sv as number, `${path}.${name}`).toBeCloseTo(pv, 9);
    else expect(sv, `${path}.${name}`).toEqual(pv);
  }
  sameTree(p, s, path);
}

const check = (r: ReturnType<typeof both>) => sameTree(r.pixiRoot, r.sceneRoot);

describe("scene test renderer parity with Pixi", () => {
  it("static attributes convert by the property table and land on the same fields", () => {
    check(
      both(html`<container label="a" x="5" y="6" alpha="0.5" visible="false" tint="#f80" angle="30" scale="2" pivot="1, 2" zIndex="3" eventMode="none">
        <sprite label="s" anchor="0.5" roundPixels="true" tint="0x00ff00" />
        <graphics label="g" />
      </container>`),
    );
  });

  it("dotted axis paths and point-like values written by bindings", () => {
    const pos = signal({ x: 7, y: 8 });
    const sx = signal(3);
    const r = both(html`<sprite label="s" [position]="pos()" [scale.x]="sx()" [skew]="0.25" [pivot.y]="9" [anchor]="pos()" />`, { pos, sx });
    check(r);
    pos.set({ x: 1, y: 2 });
    sx.set(4);
    flushSync();
    check(r);
  });

  it("x, y, angle and rotation stay in step", () => {
    const a = signal(90);
    const r = both(html`<container label="c" [angle]="a()" x="3" [y]="a()" />`, { a });
    check(r);
    a.set(45);
    flushSync();
    check(r);
    expect(r.sceneRoot.children[0]!.children[0]!.rawProperty("rotation")).toBeCloseTo(Math.PI / 4);
  });

  it("child order is the same through @for reorders, removals, insertions and @if", () => {
    const items = signal(["a", "b", "c", "d"]);
    const show = signal(true);
    const r = both(html`<container label="head" />@for (i of items(); track i) { <sprite [label]="i" [x]="i.length" /> }@if (show()) { <container label="tail" /> }<container label="end" />`, { items, show });
    check(r);
    items.set(["d", "b", "a"]);
    flushSync();
    check(r);
    items.set(["x", "a", "d", "e", "b"]);
    show.set(false);
    flushSync();
    check(r);
    items.set([]);
    show.set(true);
    flushSync();
    check(r);
  });

  it("nested components keep their host containers and order", () => {
    class Leaf {
      static meta = { selector: "game-leaf", template: html`<sprite label="leaf" x="1" />` };
    }
    class Branch {
      static meta = { selector: "game-branch", imports: [Leaf], template: html`<game-leaf></game-leaf><container label="mid"><game-leaf></game-leaf></container>` };
    }
    class Top {
      static meta = { selector: "game-top", imports: [Branch], template: html`<game-branch></game-branch><game-branch></game-branch>` };
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pixi = createPixiRenderer();
    const scene = createSceneTestRenderer();
    live.push(createComponent(Top as never, { renderer: pixi as never, parent: pixi.root as never }));
    live.push(createComponent(Top as never, { renderer: scene.renderer as never, parent: scene.root as never }));
    flushSync();
    sameTree(pixi.root, scene.root);
  });

  it("an unloaded texture alias is an empty texture on both", () => {
    check(both(html`<sprite label="s" texture="missing" />`));
  });

  it("hyphenated tags (tiling-sprite, nine-slice-sprite) take the same properties through the renderer API", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pixi = createPixiRenderer();
    const scene = createSceneTestRenderer();
    for (const r of [pixi, scene.renderer] as Array<any>) {
      const parent = r === pixi ? pixi.root : scene.root;
      const t = r.createElement("tiling-sprite", parent);
      r.setAttribute(t, "label", "t");
      r.setAttribute(t, "tilePosition", "4, 5");
      r.setAttribute(t, "tileScale", "2");
      r.setAttribute(t, "tileRotation", "0.5");
      r.insert(parent, t, null);
      const n = r.createElement("nine-slice-sprite", parent);
      r.setAttribute(n, "label", "n");
      r.setAttribute(n, "leftWidth", "3");
      r.setAttribute(n, "topHeight", "4");
      r.insert(parent, n, null);
    }
    sameTree(pixi.root, scene.root);
    expect(scene.root.children.map((c) => c.tag)).toEqual(["tiling-sprite", "nine-slice-sprite"]);
  });

  it("particle-container takes the same properties and its particles start with the same fields", () => {
    check(both(html`<particle-container label="field" x="5" alpha="0.5" roundPixels="true" />`));
    const pixi = createPixiRenderer();
    const scene = createSceneTestRenderer();
    const sets = [particles(pixi.createElement("particle-container", null)), particles(scene.renderer.createElement("particle-container", null))];
    const fields = ["x", "y", "scaleX", "scaleY", "anchorX", "anchorY", "rotation", "tint", "alpha"] as const;
    for (const set of sets) {
      set.add();
      set.add({ x: 3, y: 4, scaleX: 2, anchorX: 0.5, rotation: 1, tint: 0x336699, alpha: 0.25 });
    }
    for (let i = 0; i < 2; i++) for (const f of fields) expect(sets[1]!.items[i]![f], `particle ${i}.${f}`).toEqual(sets[0]!.items[i]![f]);
  });

  it("listening upgrades eventMode to static on both", () => {
    const r = both(html`<container label="c" (pointerdown)="noop()" /><container label="d" eventMode="dynamic" (pointerdown)="noop()" />`, { noop() {} });
    check(r);
    expect((r.pixiRoot.children[0]!.children[0] as Container).eventMode).toBe("static");
    expect((r.pixiRoot.children[0]!.children[1] as Container).eventMode).toBe("dynamic");
  });

  it("rejects the same unknown tags, properties and static values", () => {
    const pixi = createPixiRenderer();
    const scene = createSceneTestRenderer();
    const cases: Array<(r: { createElement: any; setProperty: any; setAttribute: any; insert: any }) => void> = [
      (r) => r.createElement("div", null),
      (r) => r.setProperty(r.createElement("sprite", null), "nope", 1),
      (r) => r.setProperty(r.createElement("container", null), "scale.z", 1),
      (r) => r.setAttribute(r.createElement("container", null), "x", "abc"),
      (r) => r.setAttribute(r.createElement("container", null), "visible", "maybe"),
      (r) => r.setAttribute(r.createElement("sprite", null), "texture2", "x"),
      (r) => r.insert(r.createElement("particle-container", null), r.createElement("sprite", null), null),
    ];
    for (const run of cases) {
      let pixiError = "";
      let sceneError = "";
      try {
        run(pixi as never);
      } catch (e) {
        pixiError = (e as Error).message;
      }
      try {
        run(scene.renderer as never);
      } catch (e) {
        sceneError = (e as Error).message;
      }
      expect(pixiError).not.toBe("");
      expect(sceneError).toBe(pixiError);
    }
  });
});
