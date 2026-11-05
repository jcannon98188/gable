import { describe, expect, it } from "vitest";
import { defineRendererConformance } from "./conformance.js";
import { createTestRenderer, createTestRoot, textContent, type TestNode } from "./renderer.js";

defineRendererConformance<TestNode>(
  { describe, it, expect },
  {
    name: "Test renderer",
    create() {
      const root = createTestRoot();
      return { renderer: createTestRenderer(), root };
    },
    tag: (n) => n.tag!,
    children: (n) => n.children,
    text: textContent,
    attribute: (n, name) => n.attrs[name] ?? null,
    hasClass: (n, name) => n.classes.includes(name),
    style: (n, name) => n.styles[name] ?? "",
    property: (n, name) => n.props[name],
    fire: (n, name) => n.listeners[name]?.slice().forEach((l) => l({})),
  },
);
