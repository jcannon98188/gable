import "pixi.js/events";
import { Container, Filter, Graphics, Sprite, Text } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createPixiRenderer } from "./renderer.js";

const make = () => createPixiRenderer();

describe("tag registry", () => {
  it("creates the Pixi class for each v1 scene tag", () => {
    const r = make();
    expect(r.createElement("container", null)).toBeInstanceOf(Container);
    expect(r.createElement("sprite", null)).toBeInstanceOf(Sprite);
    expect(r.createElement("text", null)).toBeInstanceOf(Text);
    expect(r.createElement("graphics", null)).toBeInstanceOf(Graphics);
  });

  it("makes an unregistered hyphenated tag a plain container (a component host)", () => {
    const r = make();
    const node = r.createElement("game-ship", null);
    expect(node).toBeInstanceOf(Container);
    expect(node.label).toBe("game-ship");
  });

  it("throws a dev error naming the renderer for an unhyphenated unknown tag", () => {
    const r = make();
    expect(() => r.createElement("div", null)).toThrow(/Unknown scene tag <div>.*"pixi"/);
    expect(() => r.createElement("sprte", null)).toThrow(/Unknown scene tag <sprte>/);
  });

  it("creates the class of a registered tag, hyphenated or not", () => {
    const r = make();
    class Ring extends Container {}
    r.registerTag("ring", { create: () => new Ring() });
    r.registerTag("my-ring", { create: () => new Ring() });
    expect(r.createElement("ring", null)).toBeInstanceOf(Ring);
    expect(r.createElement("my-ring", null)).toBeInstanceOf(Ring);
  });

  it("rejects an unknown property on a scene tag and names the tag", () => {
    const r = make();
    const sprite = r.createElement("sprite", null);
    expect(() => r.setProperty(sprite, "nope", 1)).toThrow(/Unknown property "nope" on <sprite>/);
    expect(() => r.setProperty(sprite, "scale.z", 1)).toThrow(/Unknown property "scale\.z" on <sprite>/);
  });

  it("rejects text content under a non-text tag", () => {
    const r = make();
    const box = r.createElement("container", null);
    expect(() => r.insert(box, r.createText("hello"))).toThrow(/Text content is only allowed in <text> and <bitmap-text>/);
    expect(() => r.insert(box, r.createText("  \n "))).not.toThrow();
  });
});

describe("property writes", () => {
  it("writes plain fields directly", () => {
    const r = make();
    const n = r.createElement("sprite", null);
    r.setProperty(n, "x", 12);
    r.setProperty(n, "alpha", 0.5);
    r.setProperty(n, "label", "hero");
    expect([n.x, n.alpha, n.label]).toEqual([12, 0.5, "hero"]);
  });

  it("writes dotted paths to one axis only", () => {
    const r = make();
    const n = r.createElement("sprite", null) as Sprite;
    r.setProperty(n, "scale.x", 3);
    expect([n.scale.x, n.scale.y]).toEqual([3, 1]);
    r.setProperty(n, "anchor.y", 0.5);
    expect([n.anchor.x, n.anchor.y]).toEqual([0, 0.5]);
  });

  it("accepts a number or an {x, y} object for point-like properties", () => {
    const r = make();
    const n = r.createElement("container", null);
    r.setProperty(n, "scale", 2);
    expect([n.scale.x, n.scale.y]).toEqual([2, 2]);
    r.setProperty(n, "position", { x: 4, y: 5 });
    expect([n.x, n.y]).toEqual([4, 5]);
  });

  it("writes flat text style fields into the text style, and [text]", () => {
    const r = make();
    const t = r.createElement("text", null) as Text;
    r.setProperty(t, "text", "score");
    r.setProperty(t, "fontSize", 30);
    r.setProperty(t, "fill", 0xff0000);
    expect(t.text).toBe("score");
    expect(t.style.fontSize).toBe(30);
    expect(t.style.fill).toBe(0xff0000);
  });

  it("takes text content from element content, including interpolation updates", () => {
    const r = make();
    const t = r.createElement("text", null) as Text;
    const a = r.createText("Score: ");
    const b = r.createText("0");
    r.insert(t, a);
    r.insert(t, b);
    expect(t.text).toBe("Score: 0");
    r.setText(b, "10");
    expect(t.text).toBe("Score: 10");
  });

  it("converts static attributes by the property table, not by guessing", () => {
    const r = make();
    const t = r.createElement("text", null) as Text;
    r.setAttribute(t, "text", "123");
    expect(t.text).toBe("123");
    r.setAttribute(t, "x", "7");
    expect(t.x).toBe(7);
    r.setAttribute(t, "fill", "#ff0000");
    expect(t.style.fill).toBe(0xff0000);
    r.setAttribute(t, "visible", "false");
    expect(t.visible).toBe(false);
    expect(() => r.setAttribute(t, "x", "abc")).toThrow(/expected a number/);
    expect(() => r.setAttribute(t, "mask", "m")).toThrow(/cannot be set statically/);
  });

  it("writes only the property that changed", () => {
    const r = make();
    const n = r.createElement("container", null);
    r.setProperty(n, "y", 9);
    r.setProperty(n, "x", 1);
    expect([n.x, n.y]).toEqual([1, 9]);
  });
});

describe("ordering", () => {
  it("child order is insertion order; before places a node ahead of a sibling", () => {
    const r = make();
    const parent = r.createElement("container", null);
    const a = r.createElement("container", null);
    const b = r.createElement("container", null);
    const c = r.createElement("container", null);
    r.insert(parent, a);
    r.insert(parent, c);
    r.insert(parent, b, c);
    expect(parent.children).toEqual([a, b, c]);
    r.insert(parent, a, null); // a move
    expect(parent.children).toEqual([b, c, a]);
  });

  it("appends before a non-display anchor-like sibling that is not a child", () => {
    const r = make();
    const parent = r.createElement("container", null);
    const a = r.createElement("container", null);
    r.insert(parent, a, r.createAnchor());
    expect(parent.children).toEqual([a]);
  });

  it("makes containers sort by zIndex by default, and a zIndex write dirties the sort", () => {
    const r = make();
    const parent = r.createElement("container", null);
    expect(parent.sortableChildren).toBe(true);
    const a = r.createElement("sprite", null);
    const b = r.createElement("sprite", null);
    r.insert(parent, a);
    r.insert(parent, b);
    parent.sortChildren();
    expect(parent.sortDirty).toBe(false);
    r.setProperty(a, "zIndex", 5);
    expect(parent.sortDirty).toBe(true);
    parent.sortChildren();
    expect(parent.children).toEqual([b, a]);
  });

  it("allows turning sortableChildren off", () => {
    const r = make();
    const p = r.createElement("container", null);
    r.setProperty(p, "sortableChildren", false);
    expect(p.sortableChildren).toBe(false);
  });

  it("remove detaches and destroys the node", () => {
    const r = make();
    const parent = r.createElement("container", null);
    const a = r.createElement("container", null);
    r.insert(parent, a);
    r.remove(a);
    expect(parent.children).toHaveLength(0);
    expect(a.destroyed).toBe(true);
  });
});

describe("graphics shapes", () => {
  function shapes() {
    const r = make();
    const g = r.createElement("graphics", null) as Graphics;
    return { r, g };
  }

  it("redraws once per frame however many shapes change", () => {
    const { r, g } = shapes();
    let clears = 0;
    const clear = g.clear.bind(g);
    g.clear = () => {
      clears++;
      return clear();
    };
    const rect = r.createElement("rect", g);
    const circle = r.createElement("circle", g);
    r.insert(g, rect);
    r.insert(g, circle);
    r.setProperty(rect, "width", 10);
    r.setProperty(rect, "height", 20);
    r.setProperty(rect, "fill", 0xff0000);
    r.setProperty(circle, "radius", 5);
    expect(clears).toBe(0);
    r.frame();
    expect(clears).toBe(1);
    r.frame(); // nothing changed
    expect(clears).toBe(1);
    r.setProperty(circle, "radius", 6);
    r.frame();
    expect(clears).toBe(2);
  });

  it("draws the shapes in child order with their paint", () => {
    const { r, g } = shapes();
    const rect = r.createElement("rect", g);
    r.setProperty(rect, "width", 10);
    r.setProperty(rect, "height", 20);
    r.setProperty(rect, "fill", 0xff0000);
    r.insert(g, rect);
    r.frame();
    const b = g.getLocalBounds();
    expect([b.width, b.height]).toEqual([10, 20]);
    const ellipse = r.createElement("ellipse", g);
    r.setProperty(ellipse, "halfWidth", 30);
    r.setProperty(ellipse, "halfHeight", 4);
    r.insert(g, ellipse);
    r.frame();
    expect(g.getLocalBounds().width).toBe(60);
  });

  it("removing a shape redraws the rest", () => {
    const { r, g } = shapes();
    const rect = r.createElement("rect", g);
    r.setProperty(rect, "width", 10);
    r.setProperty(rect, "height", 10);
    r.insert(g, rect);
    r.frame();
    expect(g.getLocalBounds().width).toBe(10);
    r.remove(rect);
    r.frame();
    expect(g.getLocalBounds().width).toBe(0);
  });

  it("supports polygon points and rounded-rect radius", () => {
    const { r, g } = shapes();
    const poly = r.createElement("polygon", g);
    r.setProperty(poly, "points", [0, 0, 10, 0, 10, 8]);
    r.insert(g, poly);
    const rr = r.createElement("rounded-rect", g);
    r.setProperty(rr, "x", 20);
    r.setProperty(rr, "width", 10);
    r.setProperty(rr, "height", 10);
    r.setProperty(rr, "radius", 2);
    r.insert(g, rr);
    r.frame();
    expect(g.getLocalBounds().width).toBe(30);
  });

  it("rejects a shape outside a graphics, and unknown shape properties", () => {
    const { r, g } = shapes();
    const rect = r.createElement("rect", g);
    expect(() => r.insert(r.createElement("container", null), rect)).toThrow(/<rect> can only be a child of <graphics>/);
    expect(() => r.setProperty(rect, "radius", 1)).toThrow(/Unknown property "radius" on <rect>/);
  });
});

describe("masks and filters", () => {
  it("sets a mask from a node reference and keeps the mask node in the scene", () => {
    const r = make();
    const parent = r.createElement("container", null);
    const target = r.createElement("sprite", null);
    const maskNode = r.createElement("graphics", null);
    r.insert(parent, target);
    r.insert(parent, maskNode);
    r.setProperty(target, "mask", maskNode);
    expect(target.mask).toBe(maskNode);
    expect(maskNode.parent).toBe(parent);
    r.setProperty(target, "mask", null);
    expect(target.mask).toBeFalsy();
  });

  it("takes Filter instances built in code", () => {
    const r = make();
    const n = r.createElement("container", null);
    // A stand-in: real filters compile GL programs, which needs a browser. The renderer only assigns the array.
    const blur = { enabled: true, padding: 0 } as unknown as Filter;
    r.setProperty(n, "filters", [blur]);
    expect(n.filters).toEqual([blur]);
  });
});

describe("destroy", () => {
  it("destroys the scene root and everything under it", () => {
    const r = make();
    const a = r.createElement("container", null);
    const b = r.createElement("sprite", null);
    r.insert(r.root, a);
    r.insert(a, b);
    r.destroy();
    expect(r.root.destroyed).toBe(true);
    expect(a.destroyed).toBe(true);
    expect(b.destroyed).toBe(true);
    r.destroy(); // idempotent
  });
});
