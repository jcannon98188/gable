import { describe, expect, it } from "vitest";
import { parseTemplateTree, type TemplateItem } from "./index.js";

const elements = (items: TemplateItem[]): Array<Extract<TemplateItem, { k: "el" }>> =>
  items.flatMap((it) => (it.k === "el" ? [it, ...elements(it.items)] : it.k === "chain" ? it.parts.flatMap((p) => elements(p.items)) : []));

describe("parser positions (the designer's position authority)", () => {
  const src = `\n  <div class="a" [title]='t()' disabled>\n    <b>x</b>\n    @if (ok()) {<i>y</i>}\n  </div>\n`;
  const tree = parseTemplateTree(src);
  const els = elements(tree);

  it("gives every element its start, open-tag end and closing-tag start in the raw text", () => {
    expect(els.map((e) => e.name)).toEqual(["div", "b", "i"]);
    for (const e of els) {
      expect(src[e.start]).toBe("<");
      expect(src.slice(e.start + 1, e.nameEnd)).toBe(e.name);
      expect(src[e.openEnd - 1]).toBe(">");
      expect(src.slice(e.closeStart, e.closeStart + 2 + e.name.length)).toBe(`</${e.name}`);
    }
  });

  it("locates attribute names, values and quotes exactly", () => {
    const div = els[0]!;
    const [cls, title, disabled] = div.attrInfo;
    expect(src.slice(cls!.valueStart, cls!.valueEnd)).toBe("a");
    expect(cls!.quote).toBe('"');
    expect(src.slice(title!.start, title!.nameEnd)).toBe("[title]");
    expect(src.slice(title!.valueStart, title!.valueEnd)).toBe("t()");
    expect(title!.quote).toBe("'");
    expect(src.slice(disabled!.start, disabled!.end)).toBe("disabled");
  });
});
