import { describe, expect, it } from "vitest";
import { mount } from "@gable/testing";
import { formatTemplateLiterals } from "@gable/template-format";
import { FormatDemo, SAMPLE } from "./format-demo.js";

describe("FormatDemo", () => {
  it("shows the output of the real formatter for the sample, leaving code outside the literal alone", async () => {
    const f = mount(FormatDemo);
    await f.flush();
    const demo = f.instance as FormatDemo;
    expect(demo.formatted()).toBe(formatTemplateLiterals(SAMPLE));
    expect(demo.formatted()).not.toBe(SAMPLE);
    expect(demo.formatted().startsWith("export class Card {")).toBe(true);
    expect(f.text()).toContain("gable-format would rewrite this file.");
    expect(f.text()).toContain("@if (count() > 0) {");
  });

  it("re-formats when the print width changes and reports an already formatted source", async () => {
    const f = mount(FormatDemo);
    await f.flush();
    const demo = f.instance as FormatDemo;
    const wide = demo.formatted();
    demo.width.set(30);
    await f.flush();
    expect(demo.formatted()).not.toBe(wide);
    demo.source.set(wide);
    demo.width.set(80);
    await f.flush();
    expect(f.text()).toContain("Already formatted");
  });
});
