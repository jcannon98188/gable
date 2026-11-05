import { describe, expect, it } from "vitest";
import * as prettier from "prettier";
import * as gable from "./index.js";

const sample = `import { html, signal } from "@gable/core";

export class Counter {
    static meta = {
        selector: "app-counter",
        template: html\`<h1>{{title()}}</h1>@if(n()>0){<p>count {{n()}}</p>}@else{<p>none</p>}<button (click)="inc()">+</button>\`,
    };
    n = signal(0);
    title = signal("x");
    other = css\`a   { color: red }\`;
}
`;

const run = (code: string, filepath = "counter.ts", extra: object = {}) =>
  prettier.format(code, { filepath, plugins: [gable], ...extra });

describe("@gable/prettier-plugin", () => {
  it("formats html literals with gable's formatter and the rest with Prettier", async () => {
    const out = await run(sample);
    expect(out).toContain("  static meta = {");
    expect(out).toContain("template: html`\n");
    expect(out).toContain("<h1>{{ title() }}</h1>");
    expect(out).toContain("} @else {");
    // Other embedded languages stay Prettier's business.
    expect(out).toContain("color: red;");
  });

  it("is idempotent across passes and unaffected by Prettier's own html embedding", async () => {
    const once = await run(sample);
    expect(await run(once)).toBe(once);
    const off = await run(sample, "counter.ts", { embeddedLanguageFormatting: "off" });
    const auto = await run(sample, "counter.ts", { embeddedLanguageFormatting: "auto" });
    expect(off).toContain("<h1>{{ title() }}</h1>");
    expect(off).toContain("other = css`a   { color: red }`;");
    expect(auto.slice(auto.indexOf("template:"), auto.indexOf("n = signal"))).toBe(off.slice(off.indexOf("template:"), off.indexOf("n = signal")));
  });

  it("re-indents literals to follow the surrounding code and honours tabs", async () => {
    const out = await run(sample, "counter.ts", { useTabs: true });
    expect(out).toContain("\t\ttemplate: html`\n\t\t\t<h1>");
    expect(out).toMatch(/\n\t\t`,\n/);
  });

  it("works for .js files and leaves files without html literals as Prettier formats them", async () => {
    expect(await run("const a   =  1\n", "a.ts")).toBe(await prettier.format("const a   =  1\n", { filepath: "a.ts" }));
    expect(await run("const x = html`<p>  a </p>`\n", "a.js")).toBe("const x = html`<p>a</p>`;\n");
  });
});
