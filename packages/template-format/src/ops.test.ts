import { describe, expect, it } from "vitest";
import { formatTemplate } from "./index.js";

describe("formatTemplate: comparison and logical operators", () => {
  it("keeps < > && || inside interpolations, attribute values and block headers intact", () => {
    const src = `<p [class.big]="n()>1&&!off()" title="a > b">{{  n() <= 2 || (n() >= 9)  }}</p>@if(n()<3&&n()>0){<i>x</i>}`;
    const out = formatTemplate(src);
    expect(out).toContain(`[class.big]="n()>1&&!off()"`);
    expect(out).toContain(`title="a > b"`);
    expect(out).toContain("{{ n() <= 2 || (n() >= 9) }}");
    expect(out).toContain("@if (n()<3&&n()>0)");
    expect(formatTemplate(out)).toBe(out);
  });
});
