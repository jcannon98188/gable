// Throwaway Gable Renderer over PixiJS 8. Tags: container (also every unknown tag, incl. component selectors),
// sprite [shape], graphics [circle|rectW+rectH|fill], text [text|size|fill]. Everything else is a plain Pixi property.
import type { Renderer } from "@gable/core/renderer";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

type PNode = Container & { __gfx?: { circle?: number; rectW?: number; rectH?: number; fill?: string | number; stroke?: string | number } };

export const W = 400;
export const H = 560;

export function createPixiRenderer(app: Application): Renderer<PNode> {
  const textures = new Map<string, Texture>();
  // No assets: sprite shapes are drawn once with Graphics and baked with renderer.generateTexture.
  const textureFor = (shape: string): Texture => {
    let t = textures.get(shape);
    if (t) return t;
    const g = new Graphics();
    if (shape === "ship") g.poly([0, -16, 12, 14, 0, 7, -12, 14]).fill("#ffffff");
    else g.poly([-20, -6, -8, -20, 10, -18, 20, -4, 16, 14, 0, 20, -16, 12]).fill("#ffffff").stroke({ width: 2, color: "#888888" });
    t = app.renderer.generateTexture(g);
    g.destroy();
    textures.set(shape, t);
    return t;
  };

  const redraw = (n: PNode) => {
    const s = n.__gfx!;
    const g = n as unknown as Graphics;
    g.clear();
    if (s.circle !== undefined) g.circle(0, 0, s.circle);
    else if (s.rectW !== undefined && s.rectH !== undefined) g.rect(0, 0, s.rectW, s.rectH);
    else return;
    g.fill(s.fill ?? "#ffffff");
  };

  // Static attributes arrive as strings: shape="rock" stays a string, anchor="0.5" becomes a number.
  const coerce = (v: string) => (v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);

  const r: Renderer<PNode> = {
    name: "pixi",
    createElement(tag) {
      let n: PNode;
      if (tag === "sprite") n = new Sprite(Texture.EMPTY);
      else if (tag === "graphics") {
        n = new Graphics() as unknown as PNode;
        n.__gfx = {};
      } else if (tag === "text") n = new Text({ text: "", style: { fill: "#ffffff", fontSize: 16, fontFamily: "monospace" } });
      else n = new Container();
      return n;
    },
    // Text nodes ({{ }} interpolation) are not supported on canvas: an inert container that remembers its text.
    createText(text) {
      const n = new Container() as PNode & { text?: string };
      n.text = text;
      return n;
    },
    createAnchor: () => new Container(),
    setProperty(n, name, value) {
      if (n.__gfx) {
        if (name === "circle" || name === "rectW" || name === "rectH" || name === "fill" || name === "stroke") {
          (n.__gfx as Record<string, unknown>)[name] = value;
          redraw(n);
          return;
        }
      }
      if (n instanceof Sprite && name === "shape") n.texture = textureFor(String(value));
      else if (n instanceof Text && name === "size") n.style.fontSize = Number(value);
      else if (n instanceof Text && name === "fill") n.style.fill = value as string;
      else if (name === "anchor" && n instanceof Text) n.anchor.set(Number(value));
      else if (name === "anchor" && n instanceof Sprite) n.anchor.set(Number(value));
      else if (name === "scale") n.scale.set(Number(value));
      else (n as unknown as Record<string, unknown>)[name] = value;
    },
    setAttribute(n, name, value) {
      if (value === null) return;
      r.setProperty(n, name, coerce(value));
    },
    setClass() {},
    setStyle() {},
    setText(n, text) {
      (n as unknown as { text: string }).text = text;
    },
    insert(parent, node, before) {
      node.removeFromParent();
      const at = before ? parent.getChildIndex(before) : parent.children.length;
      parent.addChildAt(node, at);
    },
    remove(node) {
      // HACK(core gap): the contract has remove() but no destroy(); we assume remove means gone for good.
      node.removeFromParent();
      node.destroy({ children: true });
    },
    listen(node, name, handler) {
      node.eventMode = "static"; // pointer events need an eventMode; static = hit-testable, no cursor churn
      node.on(name as never, handler as never);
      return () => node.off(name as never, handler as never);
    },
    resolveTarget: (t) => t as PNode,
  };
  return r;
}
