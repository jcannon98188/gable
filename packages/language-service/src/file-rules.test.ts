import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

describe("lazy() outside @defer", () => {
  it("passes lazy components used inside @defer, including its triggers, @placeholder, @loading and @error blocks", async () => {
    const { code, diagnostics } = await check("lazy-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("flags a lazy component used outside @defer and in @placeholder", async () => {
    const { code, diagnostics } = await check("lazy-fail");
    expect(code).toBe(1);
    const first = where("lazy-fail", "<x-chart>", 1);
    const third = where("lazy-fail", "@placeholder {\n        <x-chart>", "@placeholder {\n        <".length);
    expect(diagnostics.map((d) => [d.rule, d.line, d.column])).toEqual([
      ["lazy-outside-defer", first.line, first.column],
      ["lazy-outside-defer", third.line, third.column],
    ]);
    expect(diagnostics[0]!.message).toMatch(/Chart/);
  });
});
