import { describe, expect, it } from "vitest";
import { checkTemplateSyntax } from "./analyze.js";

const component = (template: string) => `import { html } from "@gable/core";

export class Demo {
  static meta = {
    selector: "app-demo",
    template: html\`
${template}
    \`,
  };
  open = () => true;
}
`;

/** 1-based line and column of `snippet` (plus `into` characters) in `text`. */
function at(text: string, snippet: string, into = 0) {
  const offset = text.indexOf(snippet) + into;
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
}

describe("checkTemplateSyntax", () => {
  it("finds nothing in a template that compiles", () => {
    expect(checkTemplateSyntax("demo.ts", component(`<p [class.on]="open()" (click)="open()">{{ open() }}</p>`))).toEqual([]);
  });

  it("reports interpolation in a plain attribute where it is written, as an error", () => {
    const text = component(`      <h1 class="x {{ open() }}">Title</h1>`);
    const [d, ...rest] = checkTemplateSyntax("demo.ts", text);
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ file: "demo.ts", rule: "template-syntax", severity: "error", message: 'Interpolation in attribute "class" is not supported; use [attr.class] or [class.name].' });
    expect({ line: d!.line, column: d!.column }).toEqual(at(text, 'x {{ open() }}'));
  });

  it("reports an expression the runtime parser rejects, at the expression", () => {
    const text = component(`      <p>{{ open( }}</p>
      @if (open() &&) { <b>x</b> }`);
    const found = checkTemplateSyntax("demo.ts", text);
    expect(found.map((d) => d.rule)).toEqual(["expression-syntax", "expression-syntax"]);
    expect({ line: found[0]!.line, column: found[0]!.column }).toEqual(at(text, "open( "));
    expect(found[1]!.line).toBe(at(text, "@if").line);
  });

  it("reports structural errors (an unclosed element)", () => {
    const [d] = checkTemplateSyntax("demo.ts", component(`      <section><p>text</section>`));
    expect(d).toMatchObject({ rule: "template-syntax", severity: "error" });
  });

  it("reads only `static meta` templates of the given tag", () => {
    const text = component(`<p>ok</p>`).replace("html`", "tpl`").replace('{ html }', '{ html as tpl }');
    expect(checkTemplateSyntax("demo.ts", text.replace("<p>ok</p>", '<p class="{{ x }}"></p>'))).toEqual([]);
    expect(checkTemplateSyntax("demo.ts", text.replace("<p>ok</p>", '<p class="{{ x }}"></p>'), "tpl")).toHaveLength(1);
  });
});
