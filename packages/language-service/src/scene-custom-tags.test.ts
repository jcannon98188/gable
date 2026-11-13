import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

// Custom scene tags (renderer.registerTag) are declared to the analyzer by a string-literal registerTag call or the `sceneTags` plugin option.
describe("custom scene tags", () => {
  it("accepts a registered tag and a configured tag, and still flags a typo of a built-in or custom name", async () => {
    const { diagnostics } = await check("scene-custom-tags");
    const unknown = diagnostics.filter((d) => d.rule === "scene-unknown-tag");
    expect(unknown.map((d) => `${d.line}:${d.column}`)).toEqual([`${where("scene-custom-tags", "<stor>").line}:${where("scene-custom-tags", "<stor>").column + 1}`]);
    expect(diagnostics.filter((d) => d.rule !== "scene-unknown-tag")).toEqual([]);
  });
});
