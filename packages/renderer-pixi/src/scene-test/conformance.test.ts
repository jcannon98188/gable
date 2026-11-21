import { describe, expect, it } from "vitest";
import { defineRendererConformance } from "@gablejs/testing/renderer";
import { createSceneTestRenderer, type SceneNode } from "../testing.js";

// The Renderer contract's own vocabulary is DOM-flavoured (`p`, `div`, classes, styles, text in elements), so the contract
// suite runs the double in its lenient mode. Everything Pixi-specific is covered by scene-test.test.ts and the parity suite.
defineRendererConformance<SceneNode>(
  { describe, it, expect },
  {
    name: "Scene test renderer",
    create() {
      const scene = createSceneTestRenderer({ lenient: true });
      return { renderer: scene.renderer, root: scene.root };
    },
    tag: (n) => {
      if (n.kind !== "node") throw new Error("not an element");
      return n.tag;
    },
    children: (n) => [...n.children],
    text: (n) => n.textContent(),
    attribute: (n, name) => n.attrs[name] ?? null,
    hasClass: (n, name) => n.classes.includes(name),
    style: (n, name) => n.styles[name] ?? "",
    property: (n, name) => n.rawProperty(name),
    fire: (n, name) => n.emit(name, {}),
  },
);
