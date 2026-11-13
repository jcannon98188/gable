import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

// scene-structure: shape tags belong in <graphics>, text belongs in <text> and <bitmap-text>. The renderers throw at runtime; the analyzer says it in the editor.
describe("scene-structure", () => {
  it("flags shapes and text in the wrong parent, through @if, and accepts the right ones", async () => {
    const { diagnostics } = await check("scene-structure");
    const found = diagnostics.filter((d) => d.rule === "scene-structure").map((d) => `${d.line}:${d.column}`);
    const at = (needle: string, into = 0) => {
      const w = where("scene-structure", needle, into);
      return `${w.line}:${w.column}`;
    };
    // the second <rect> and <circle> (inside <container>), the stray words, and {{ 2 }} inside <sprite>
    expect(found.sort()).toEqual([at('<rect width="1"', 1), at('<circle radius="1"', 1), at("stray words"), at("{{ 2 }}")].sort());
    expect(diagnostics.filter((d) => d.rule !== "scene-structure")).toEqual([]);
  });
});
