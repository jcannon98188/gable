import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";

describe("i18n marker rules", () => {
  it("passes correct markers, including a bound attribute with no marker", async () => {
    const { code, diagnostics } = await check("i18n-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("reports each marker mistake at the marker", async () => {
    const { code, diagnostics } = await check("i18n-fail");
    const at = (snippet: string, into = 0) => where("i18n-fail", snippet, into);
    const expected: Array<[string, { line: number; column: number }, string]> = [
      ["i18n-empty", at('i18n="nothing"'), "warn"],
      ["i18n-empty", at("<p i18n>{{", 3), "warn"],
      ["i18n-not-translatable", at('i18n="mixed"'), "error"],
      ["i18n-attr-missing", at("i18n-title=\"missing\""), "error"],
      ["i18n-not-translatable", at("i18n-title=\"bound\""), "error"],
      ["i18n-marker-syntax", at('i18n="empty id@@"'), "error"],
    ];
    expect(diagnostics.map((d) => [d.rule, d.line, d.column, d.severity])).toEqual(expected.map(([rule, p, severity]) => [rule, p.line, p.column, severity]));
    expect(code).toBe(1);
  });

  it("explains what to do", async () => {
    const { diagnostics } = await check("i18n-fail");
    const message = (rule: string, text: string) => diagnostics.find((d) => d.rule === rule && d.message.includes(text))?.message;
    expect(message("i18n-attr-missing", "i18n-title")).toMatch(/has no title="..." attribute/);
    expect(message("i18n-not-translatable", "[title]")).toMatch(/only static text is translated/);
    expect(message("i18n-marker-syntax", "id")).toMatch(/Empty id/);
  });
});
