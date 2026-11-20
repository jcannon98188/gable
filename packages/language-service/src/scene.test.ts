import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

// Scene templates (a renderer boundary, a component marked with `elements: pixiElements`, and the
// children projected into a boundary) are type-checked against the Pixi element map (canvas/112).

describe("scene templates: typing enforced against the Pixi element map", () => {
  it("passes valid scene templates, projected children and DOM/SVG templates", async () => {
    const { code, diagnostics } = await check("scene-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  const expectations: Array<[rule: string, snippet: string, into: number]> = [
    ["scene-unknown-tag", "sprte", 0],
    ["scene-unknown-tag", "<div>", 1],
    ["scene-unknown-property", "alhpa", 0],
    ["type-mismatch", "label()", 0],
    ["scene-unknown-property", "scale.z", 0],
    ["scene-unknown-property", "alpha.x", 0],
    ["scene-unknown-property", "scale.x.y", 0],
    ["scene-unknown-property", "style.color", 0],
    ["unknown-event", "pointerdwn", 0],
    ["unknown-member", "nope)", 0],
    ["scene-attribute", "anchor=\"abc\"", 0],
    ["scene-attribute", "x=\"abc\"", 0],
    ["scene-attribute", "visible=\"maybe\"", 0],
    ["scene-unknown-property", "tnt", 0],
    ["scene-unknown-tag", "bitmap-txt", 0],
    ["scene-unknown-property", "fill=\"#fff\"", 0],
    ["scene-unknown-tag", "hit-cirle", 0],
    ["unknown-event", "cliick", 0],
    ["scene-unknown-property", "nope]", 0],
    ["scene-unknown-tag", "<span>", 1],
    ["scene-tag-in-dom", "<sprite></sprite><div>", 1],
  ];

  it("reports exactly the bad tags, properties, values and events", async () => {
    const { code, diagnostics } = await check("scene-fail");
    expect(diagnostics.map((d) => `${d.line}:${d.rule}`).sort()).toEqual(
      expectations.map(([rule, snippet, into]) => `${where("scene-fail", snippet, into).line}:${rule}`).sort(),
    );
    expect(code).toBe(1);
  });

  it.each(expectations)("%s at %s", async (rule, snippet, into) => {
    const { diagnostics } = await check("scene-fail");
    const at = where("scene-fail", snippet, into);
    const hit = diagnostics.find((d) => d.rule === rule && d.line === at.line && d.column === at.column);
    expect(hit, JSON.stringify(diagnostics, null, 1)).toBeDefined();
    expect(hit!.severity).toBe("error");
  });

  it("suggests the closest name", async () => {
    const { diagnostics } = await check("scene-fail");
    const msg = (rule: string, text: string) => diagnostics.find((d) => d.rule === rule && d.message.includes(text))?.message ?? "";
    expect(msg("scene-unknown-tag", "sprte")).toMatch(/Did you mean "sprite"\?/);
    expect(msg("scene-unknown-property", "alhpa")).toMatch(/Did you mean "alpha"\?/);
    expect(msg("unknown-event", "pointerdwn")).toMatch(/Did you mean "pointerdown"\?/);
  });

  it("limits dotted paths to the x and y axes of point-like properties", async () => {
    const { diagnostics } = await check("scene-fail");
    for (const path of ["alpha.x", "scale.z", "scale.x.y"]) {
      expect(diagnostics.find((d) => d.rule === "scene-unknown-property" && d.message.includes(`"${path}"`)), path).toBeDefined();
    }
  });
});
