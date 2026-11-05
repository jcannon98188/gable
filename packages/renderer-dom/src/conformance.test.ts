// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defineRendererConformance } from "@gable/testing/renderer";
import { createDomRenderer } from "./index.js";

defineRendererConformance<Node>(
  { describe, it, expect },
  {
    name: "DOM renderer",
    create() {
      const root = document.createElement("div");
      root.id = "app";
      document.body.replaceChildren(root);
      return { renderer: createDomRenderer(), root, target: "#app" };
    },
    tag: (n) => (n as Element).localName,
    children: (n) => [...n.childNodes],
    text: (n) => n.textContent ?? "",
    attribute: (n, name) => (n as Element).getAttribute(name),
    hasClass: (n, name) => (n as Element).classList.contains(name),
    style: (n, name) => (n as HTMLElement).style.getPropertyValue(name),
    property: (n, name) => (n as any)[name],
    fire: (n, name) => n.dispatchEvent(new Event(name, { bubbles: true })),
  },
);
