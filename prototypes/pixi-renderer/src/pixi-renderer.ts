// A Gable Renderer<N> over PixiJS 8 display objects. No Application needed to build a scene: nodes are plain Pixi
// objects, so the boundary can build synchronously while the (async) Application initialises later.
//
// Tags (kebab case of Pixi class names): container, sprite, text, graphics. Any other tag, including every
// component selector, is a Container (the component's host node). Property names are Pixi's; dotted paths work
// (`[scale.x]`, `[anchor.y]`, `[position.x]`). Two exceptions the template syntax forces, see the spike doc:
//   [style.fill] is parsed by core as a *style* binding, so it arrives in setStyle(); we map it onto Text#style.
//   `pose` is a composite property this renderer adds (x, y, rotation in one write) for the one-signal-one-binding style.
import type { Renderer } from "@gable/core/renderer";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

export type PNode = Container & { __gfx?: { circle?: number; rectW?: number; rectH?: number; fill?: string | number } };

const textures = new Map<string, Texture>();
const drawers: Record<string, (c: CanvasRenderingContext2D) => void> = {
  rock: (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(8, 8, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#888";
    c.fillRect(8, 2, 6, 3);
  },
  ship: (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(16, 2);
    c.lineTo(28, 30);
    c.lineTo(16, 23);
    c.lineTo(4, 30);
    c.closePath();
    c.fill();
  },
};

/** Textures are drawn once on a canvas and shared; a sprite's `texture="rock"` is a lookup, not a load. */
export function textureFor(name: string): Texture {
  let t = textures.get(name);
  if (t) return t;
  const size = name === "ship" ? 32 : 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  drawers[name]?.(canvas.getContext("2d")!);
  t = Texture.from(canvas);
  textures.set(name, t);
  return t;
}

/** Static attributes arrive as strings: "0.5" becomes a number, "rock" stays a string. */
const coerce = (v: string): unknown => (v !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);

const paths = new Map<string, string[]>();
const split = (name: string): string[] => {
  let p = paths.get(name);
  if (!p) paths.set(name, (p = name.split(".")));
  return p;
};

function redraw(n: PNode) {
  const s = n.__gfx!;
  const g = n as unknown as Graphics;
  g.clear();
  if (s.circle !== undefined) g.circle(0, 0, s.circle);
  else if (s.rectW !== undefined && s.rectH !== undefined) g.rect(0, 0, s.rectW, s.rectH);
  else return;
  g.fill(s.fill ?? "#ffffff");
}

export interface PixiBoundary {
  renderer: Renderer<PNode>;
  /** The node the scene is built into; the owner adds it to `app.stage` once the Application exists. */
  root: Container;
}

export function createPixiBoundary(): PixiBoundary {
  const root = new Container({ label: "gable-scene-root" });
  const renderer: Renderer<PNode> = {
    name: "pixi",
    createElement(tag) {
      switch (tag) {
        case "sprite":
          return new Sprite(Texture.EMPTY);
        case "text":
          return new Text({ text: "", style: { fill: "#ffffff", fontSize: 16, fontFamily: "monospace" } });
        case "graphics": {
          const g = new Graphics() as unknown as PNode;
          g.__gfx = {};
          return g;
        }
        default:
          return new Container({ label: tag });
      }
    },
    // {{ }} interpolation in a scene has no canvas meaning: an inert node. Scenes bind [text] on a <text> instead.
    createText: () => new Container({ label: "#text" }),
    createAnchor: () => new Container({ label: "#anchor" }),
    setProperty(n, name, value) {
      if (n.__gfx && (name === "circle" || name === "rectW" || name === "rectH" || name === "fill")) {
        (n.__gfx as Record<string, unknown>)[name] = value;
        redraw(n);
        return;
      }
      if (name === "pose") {
        const p = value as { x: number; y: number; rotation: number };
        n.x = p.x;
        n.y = p.y;
        n.rotation = p.rotation;
        return;
      }
      if (name === "texture" && typeof value === "string") {
        (n as Sprite).texture = textureFor(value);
        return;
      }
      if ((name === "scale" || name === "anchor") && typeof value === "number") {
        (n as unknown as Record<string, { set(v: number): void }>)[name]!.set(value);
        return;
      }
      if (name.indexOf(".") < 0) {
        (n as unknown as Record<string, unknown>)[name] = value;
        return;
      }
      const path = split(name);
      let target = n as unknown as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) target = target[path[i]!] as Record<string, unknown>;
      target[path[path.length - 1]!] = value;
    },
    setAttribute(n, name, value) {
      if (value === null) return;
      renderer.setProperty(n, name, coerce(value));
    },
    setClass(n, name, on) {
      // No CSS classes on canvas; keep them as a label so devtools-style inspection still shows them.
      if (on) n.label = `${n.label ?? ""} .${name}`.trim();
    },
    setStyle(n, name, value) {
      if (n instanceof Text) (n.style as unknown as Record<string, unknown>)[name] = value;
    },
    setText(n, text) {
      (n as unknown as { text?: string }).text = text;
    },
    insert(parent, node, before) {
      if (!before) {
        parent.addChild(node);
        return;
      }
      node.removeFromParent();
      const kids = parent.children;
      // @for appends rows before its anchor, which is the last child: skip the O(n) indexOf in that case.
      const at = kids[kids.length - 1] === before ? kids.length - 1 : parent.getChildIndex(before);
      parent.addChildAt(node, at);
    },
    remove(node) {
      // The contract has remove() but no per-node destroy(): here remove means gone for good (a moved node goes through insert).
      node.removeFromParent();
      node.destroy({ children: true });
    },
    listen(node, name, handler) {
      node.eventMode = "static";
      node.on(name as never, handler as never);
      return () => node.off(name as never, handler as never);
    },
    resolveTarget: (t) => t as PNode,
    destroy() {
      if (!root.destroyed) root.destroy({ children: true });
    },
  };
  return { renderer, root };
}
