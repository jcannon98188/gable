import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

const RULE = "scene-pointer-a11y";

describe("scene-pointer-a11y: pointer-listening scene nodes need [a11y]", () => {
  it("flags exactly the scene nodes with a pointer listener and no [a11y]", async () => {
    const { diagnostics } = await check("scene-a11y-fail");
    const hits = diagnostics.filter((d) => d.rule === RULE);
    const expected = [
      where("scene-a11y-fail", "<sprite (pointerdown)"),
      where("scene-a11y-fail", "<sprite (click)"),
      where("scene-a11y-fail", "<container (tap)"),
      where("scene-a11y-fail", "<rect (mouseover)"),
      where("scene-a11y-fail", "<text (touchstart)"),
      where("scene-a11y-fail", "<sprite (pointerdown)=\"go()\"></sprite>`"),
    ].map((p) => `${p.line}:${p.column + 1}`);
    expect(hits.map((d) => `${d.line}:${d.column}`).sort()).toEqual(expected.sort());
    for (const d of hits) expect(d.message).toContain("[a11y]");
  });

  it("is a warning by default and does not fail the check", async () => {
    const { diagnostics, code } = await check("scene-a11y-fail");
    expect(diagnostics.filter((d) => d.rule === RULE).every((d) => d.severity === "warn")).toBe(true);
    expect(code).toBe(0);
  });

  it("does not flag a node that has [a11y], the wheel event, no listener, or a component tag", async () => {
    const { diagnostics } = await check("scene-a11y-fail");
    const lines = new Set(diagnostics.filter((d) => d.rule === RULE).map((d) => d.line));
    for (const snippet of ["[a11y]=", "(wheel)", "<sprite></sprite>", "<x-ship"]) expect(lines.has(where("scene-a11y-fail", snippet).line), snippet).toBe(false);
  });

  it("severity is configurable like other rules", async () => {
    const { diagnostics, code } = await check("scene-a11y-off");
    const hit = diagnostics.find((d) => d.rule === RULE);
    expect(hit?.severity).toBe("error");
    expect(code).toBe(1);
  });
});
