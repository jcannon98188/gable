import "pixi.js/events";
import { Circle, Container, Ellipse, Polygon, Rectangle, RoundedRectangle } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createPixiRenderer } from "./renderer.js";

// Declarative hit-shape children on the real Pixi renderer (TASK-105.11).
function setup() {
  const r = createPixiRenderer();
  const node = r.createElement("container", null);
  const hit = (tag: string, props: Record<string, unknown> = {}) => {
    const h = r.createElement(tag, node);
    for (const [k, v] of Object.entries(props)) r.setProperty(h, k, v);
    return h;
  };
  return { r, node, hit };
}

describe("hit-* child tags", () => {
  it("each tag sets the parent's hitArea to the matching Pixi shape", () => {
    const { r, node, hit } = setup();
    const cases: Array<[string, Record<string, unknown>, unknown]> = [
      ["hit-rect", { x: 1, y: 2, width: 3, height: 4 }, Rectangle],
      ["hit-rounded-rect", { width: 10, height: 10, radius: 2 }, RoundedRectangle],
      ["hit-circle", { x: 5, y: 5, radius: 4 }, Circle],
      ["hit-ellipse", { halfWidth: 4, halfHeight: 2 }, Ellipse],
      ["hit-polygon", { points: [0, 0, 10, 0, 10, 10] }, Polygon],
    ];
    for (const [tag, props, cls] of cases) {
      const h = hit(tag, props);
      r.insert(node, h);
      expect(node.hitArea, tag).toBeInstanceOf(cls as never);
      r.remove(h);
    }
    expect(node.hitArea).toBeNull();
  });

  it("updates the shape as signals write properties, and when the child is removed", () => {
    const { r, node, hit } = setup();
    const circle = hit("hit-circle", { x: 0, y: 0, radius: 10 });
    r.insert(node, circle);
    expect(node.hitArea!.contains(15, 0)).toBe(false);
    r.setProperty(circle, "radius", 20);
    expect(node.hitArea!.contains(15, 0)).toBe(true);
    r.setProperty(circle, "x", 100);
    expect(node.hitArea!.contains(15, 0)).toBe(false);
    r.remove(circle);
    expect(node.hitArea).toBeNull();
  });

  it("several hit children make a union, in any order", () => {
    const { r, node, hit } = setup();
    const a = hit("hit-rect", { x: 0, y: 0, width: 10, height: 10 });
    const b = hit("hit-circle", { x: 50, y: 50, radius: 5 });
    r.insert(node, a);
    r.insert(node, b);
    expect(node.hitArea!.contains(5, 5)).toBe(true);
    expect(node.hitArea!.contains(50, 50)).toBe(true);
    expect(node.hitArea!.contains(30, 30)).toBe(false);
    r.remove(a);
    expect(node.hitArea).toBeInstanceOf(Circle);
  });

  it("converts static attributes by kind", () => {
    const { r, node } = setup();
    const h = r.createElement("hit-rect", node);
    r.setAttribute(h, "width", "30");
    r.setAttribute(h, "height", "20");
    r.insert(node, h);
    expect(node.hitArea!.contains(29, 19)).toBe(true);
    expect(() => r.setAttribute(h, "width", "wide")).toThrow(/expected a number/);
  });

  it("a polygon without three points is not a hit shape yet", () => {
    const { r, node, hit } = setup();
    const p = hit("hit-polygon", { points: [0, 0, 5, 5] });
    r.insert(node, p);
    expect(node.hitArea).toBeNull();
    r.setProperty(p, "points", [0, 0, 10, 0, 0, 10]);
    expect(node.hitArea).toBeInstanceOf(Polygon);
  });

  it("wins over a bound [hitArea] while present, which comes back afterwards", () => {
    const { r, node, hit } = setup();
    const bound = new Rectangle(0, 0, 1, 1);
    r.setProperty(node, "hitArea", bound);
    const h = hit("hit-circle", { radius: 3 });
    r.insert(node, h);
    expect(node.hitArea).toBeInstanceOf(Circle);
    const other = new Rectangle(0, 0, 2, 2);
    r.setProperty(node, "hitArea", other);
    expect(node.hitArea).toBeInstanceOf(Circle);
    r.remove(h);
    expect(node.hitArea).toBe(other);
  });

  it("works on any scene tag and when moved between parents", () => {
    const { r, hit } = setup();
    const sprite = r.createElement("sprite", null);
    const graphics = r.createElement("graphics", null);
    const h = hit("hit-rect", { width: 4, height: 4 });
    r.insert(sprite, h);
    expect(sprite.hitArea).toBeInstanceOf(Rectangle);
    r.insert(graphics, h);
    expect(sprite.hitArea).toBeNull();
    expect(graphics.hitArea).toBeInstanceOf(Rectangle);
  });

  it("rejects unknown properties and listeners, and paint properties", () => {
    const { r, node, hit } = setup();
    const h = hit("hit-rect");
    r.insert(node, h);
    expect(() => r.setProperty(h, "fill", 0xff0000)).toThrow(/Unknown property "fill" on <hit-rect>/);
    expect(() => r.setProperty(h, "radius", 1)).toThrow(/Unknown property "radius" on <hit-rect>/);
    expect(() => r.listen(h as Container, "pointerdown", () => {})).toThrow(/display nodes/);
  });
});
