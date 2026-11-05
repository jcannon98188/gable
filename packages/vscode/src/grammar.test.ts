import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from "vscode-textmate";
import { createOnigScanner, createOnigString, loadWASM } from "vscode-oniguruma";

// The grammar is exercised through vscode-textmate (the engine VS Code and Shiki use). The host
// language is a stub: it only has to be `source.ts` so the injection applies, and to claim the
// text outside templates.

const require = createRequire(import.meta.url);
const read = (url: string) => readFileSync(fileURLToPath(new URL(url, import.meta.url)), "utf8");

const hostGrammar = {
  scopeName: "source.ts",
  patterns: [{ match: "\\w+|[^\\w`\\n}]", name: "host.text" }],
};

let grammar: IGrammar;
beforeAll(async () => {
  await loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer as ArrayBuffer);
  const registry = new Registry({
    onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
    getInjections: (scope) => (scope === "source.ts" ? ["gable-template.injection"] : undefined),
    loadGrammar: async (scope) => {
      if (scope === "source.ts") return parseRawGrammar(JSON.stringify(hostGrammar), "host.json");
      if (scope === "gable-template.injection") return parseRawGrammar(read("../syntaxes/gable-template.injection.json"), "gable.json");
      return null;
    },
  });
  grammar = (await registry.loadGrammar("source.ts"))!;
});

/** Tokenizes `source` and returns [text, scopes beyond the host's] per token. */
function tokens(source: string): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  let stack = INITIAL;
  for (const line of source.split("\n")) {
    const result = grammar.tokenizeLine(line, stack);
    for (const t of result.tokens) out.push([line.slice(t.startIndex, t.endIndex), t.scopes.slice(1)]);
    stack = result.ruleStack;
  }
  return out;
}

/** The scopes of the token whose text is exactly `text` (first one). */
function scopesOf(source: string, text: string): string[] {
  const hit = tokens(source).find(([t]) => t === text);
  expect(hit, `token ${JSON.stringify(text)} in ${JSON.stringify(tokens(source))}`).toBeDefined();
  return hit![1];
}

const wrap = (body: string) => "const t = html`" + body + "`;";

describe("Gable template injection grammar", () => {
  it("applies only inside html`...` templates", () => {
    expect(scopesOf(wrap("<p>hi</p>"), "p")).toContain("entity.name.tag.gable");
    expect(tokens("const t = css`<p>hi</p>`;").some(([, s]) => s.some((x) => x.endsWith(".gable")))).toBe(false);
    expect(tokens("const t = 1; // html").every(([, s]) => s.join() === "host.text")).toBe(true);
  });

  it("scopes the template body so embedded-language tools can find it", () => {
    expect(scopesOf(wrap("<p>hi</p>"), "hi")).toContain("meta.embedded.block.gable");
  });

  it("highlights tags, attribute names and plain attribute values", () => {
    const src = wrap('<input type="text" disabled />');
    expect(scopesOf(src, "input")).toContain("entity.name.tag.gable");
    expect(scopesOf(src, "type")).toContain("entity.other.attribute-name.gable");
    expect(scopesOf(src, "text")).toContain("string.quoted.double.gable");
  });

  describe("bindings", () => {
    const src = wrap('<input #box [value]="title() ?? \'none\'" [class.done]="done()" (click)="rename($event)" [(model)]="name" />');
    it("property and class bindings", () => {
      expect(scopesOf(src, "value")).toContain("entity.other.attribute-name.binding.property.gable");
      expect(scopesOf(src, "class.done")).toContain("entity.other.attribute-name.binding.property.gable");
    });
    it("event bindings", () => {
      expect(scopesOf(src, "click")).toContain("entity.other.attribute-name.binding.event.gable");
    });
    it("two-way bindings", () => {
      expect(scopesOf(src, "model")).toContain("entity.other.attribute-name.binding.two-way.gable");
    });
    it("template references", () => {
      expect(scopesOf(src, "#box")).toContain("entity.other.attribute-name.reference.gable");
    });
    it("binding values are expressions", () => {
      expect(scopesOf(src, "title")).toContain("meta.embedded.expression.gable");
      expect(scopesOf(src, "title")).toContain("entity.name.function.gable");
      expect(scopesOf(src, "'none'")).toContain("string.quoted.single.gable");
      expect(scopesOf(src, "??")).toContain("keyword.operator.gable");
      expect(scopesOf(src, "$event")).toContain("variable.language.gable");
    });
  });

  describe("interpolation", () => {
    it("scopes braces and the expression inside", () => {
      const src = wrap("<p>{{ user.name ?? 'anon' }} {{ !loading() }}</p>");
      expect(scopesOf(src, "{{")).toContain("punctuation.definition.interpolation.begin.gable");
      expect(scopesOf(src, "name")).toContain("variable.other.property.gable");
      expect(scopesOf(src, "user")).toContain("variable.other.readwrite.gable");
      expect(scopesOf(src, "!")).toContain("keyword.operator.gable");
      expect(scopesOf(src, "}}")).toContain("punctuation.definition.interpolation.end.gable");
    });
    it("recognises literals and numbers", () => {
      const src = wrap("<p>{{ count() > 0 }} {{ null }} {{ 42 }}</p>");
      expect(scopesOf(src, "null")).toContain("constant.language.gable");
      expect(scopesOf(src, "42")).toContain("constant.numeric.gable");
    });
  });

  describe("control flow blocks", () => {
    const src = wrap("@for (todo of todos(); track todo.id) {\n<li>{{ todo.title }}</li>\n} @empty {\n<li>none</li>\n}\n@if (a(); as b) {x} @else if (c()) {y} @let n = count();");
    it("highlights block keywords", () => {
      for (const kw of ["@for", "@empty", "@if", "@else if", "@let"]) expect(scopesOf(src, kw), kw).toContain("keyword.control.block.gable");
    });
    it("treats block headers as expressions", () => {
      expect(scopesOf(src, "todos")).toContain("meta.embedded.expression.gable");
      expect(scopesOf(src, "track")).toContain("keyword.control.gable");
      expect(scopesOf(src, "of")).toContain("keyword.control.gable");
      expect(scopesOf(src, "as")).toContain("keyword.control.gable");
    });
    it("does not mistake an email-like @ for a block", () => {
      expect(tokens(wrap("<p>a@example.com</p>")).some(([, s]) => s.includes("keyword.control.block.gable"))).toBe(false);
    });
  });

  it("highlights ${} holes as host-language code and closing tags and comments", () => {
    const src = wrap("<!-- note --><p>${ value }</p>");
    expect(scopesOf(src, "<!--")).toContain("punctuation.definition.comment.begin.gable");
    expect(scopesOf(src, " note ")).toContain("comment.block.gable");
    expect(scopesOf(src, "${")).toContain("punctuation.section.embedded.begin.gable");
    expect(scopesOf(src, "value")).toContain("meta.embedded.line.ts");
  });

  it("returns to the host language after the closing backtick", () => {
    const toks = tokens(wrap("<p>x</p>") + "\nconst after = 1;");
    expect(toks.slice(-8).every(([, s]) => s.join() === "host.text")).toBe(true);
    expect(toks.slice(-8).map(([t]) => t).join("")).toBe("const after = 1;");
  });
});
