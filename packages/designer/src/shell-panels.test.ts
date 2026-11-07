import { describe, expect, it } from "vitest";
import { preview } from "@gable/core/devtools";
import { previewValue } from "../shell/src/app/panels.js";

// The Inspector hands the JSON viewer a plain value rebuilt from the agent's Preview.
describe("previewValue", () => {
  it("turns scalars into plain values", () => {
    expect(previewValue(preview(3))).toBe(3);
    expect(previewValue(preview(true))).toBe(true);
    expect(previewValue(preview(null))).toBe(null);
    expect(previewValue(preview("a\"b"))).toBe('a"b');
    expect(previewValue(preview(undefined))).toBe("undefined");
  });

  it("rebuilds nested objects and arrays", () => {
    expect(previewValue(preview({ n: 1, list: [1, "x"], deep: { ok: false } }))).toEqual({ n: 1, list: [1, "x"], deep: { ok: false } });
  });

  it("marks children the preview left out", () => {
    const big = Array.from({ length: 30 }, (_, i) => i);
    const out = previewValue(preview(big)) as unknown[];
    expect(out).toHaveLength(21);
    expect(out[20]).toBe("… 10 more");
  });

  it("keeps summaries for values it cannot expand", () => {
    expect(previewValue(preview(new Date(0)))).toBe("1970-01-01T00:00:00.000Z");
    expect(previewValue(preview(() => 1))).toMatch(/^ƒ/);
    expect(previewValue(preview({ a: { b: { c: 1 } } }))).toEqual({ a: { b: "{…}" } });
  });
});
