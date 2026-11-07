import { describe, expect, it } from "vitest";
import { normalizeLanguage, tokenize, type Token, type TokenKind } from "./lib/highlight.js";

const kinds = (code: string, lang: string): Array<[string, TokenKind]> => tokenize(code, lang).flat().filter((t) => t.kind !== "plain").map((t) => [t.text, t.kind]);
const has = (code: string, lang: string, text: string, kind: TokenKind) => expect(kinds(code, lang)).toContainEqual([text, kind]);
const joined = (lines: Token[][]) => lines.map((l) => l.map((t) => t.text).join(""));
const LANGS = ["ts", "tsx", "js", "jsx", "json", "html", "css", "bash", "text", "diff", "nope"];

describe("normalizeLanguage", () => {
  it("maps aliases and falls back to text", () => {
    expect(normalizeLanguage("TypeScript")).toBe("ts");
    expect(normalizeLanguage(" sh ")).toBe("bash");
    expect(normalizeLanguage("gable")).toBe("html");
    expect(normalizeLanguage("cobol")).toBe("text");
    expect(normalizeLanguage(undefined as never)).toBe("text");
  });
});

describe("typescript / javascript", () => {
  it("colours keywords, strings, numbers, comments, functions, types and properties", () => {
    const code = 'const total: number = add(1, 2.5e3); // sum\nclass Foo extends Bar { name: "x" }\nobj.value;';
    has(code, "ts", "const", "keyword");
    has(code, "ts", "number", "type");
    has(code, "ts", "add", "function");
    has(code, "ts", "2.5e3", "number");
    has(code, "ts", "// sum", "comment");
    has(code, "ts", "Foo", "type");
    has(code, "ts", "name", "property");
    has(code, "ts", '"x"', "string");
    has(code, "ts", "value", "property");
  });
  it("carries block comments and template literals across lines", () => {
    const lines = tokenize("/* a\n b */ x\n`one ${y}\ntwo`", "ts");
    expect(lines[0]![0]).toEqual({ text: "/* a", kind: "comment" });
    expect(lines[1]![0]).toEqual({ text: " b */", kind: "comment" });
    expect(lines[2]![0]).toEqual({ text: "`one ", kind: "string" });
    expect(lines[3]![0]).toEqual({ text: "two`", kind: "string" });
  });
  it("tokenizes jsx tags and attributes only for jsx and tsx", () => {
    const code = 'return <Button size="sm">Hi</Button>;';
    has(code, "tsx", "Button", "tag");
    has(code, "jsx", "size", "attr");
    expect(kinds(code, "ts").some(([, k]) => k === "tag")).toBe(false);
  });
});

describe("json", () => {
  it("separates keys from string values", () => {
    const code = '{ "a": [1, -2.5, true, null], "b": "x" }';
    has(code, "json", '"a"', "property");
    has(code, "json", '"b"', "property");
    has(code, "json", '"x"', "string");
    has(code, "json", "-2.5", "number");
    has(code, "json", "true", "keyword");
    has(code, "json", "null", "keyword");
  });
});

describe("html and gable templates", () => {
  const code = '<!doctype html>\n<!-- hi -->\n<button class="a" [disabled]="busy()" (click)="go()" *if="ok">{{ label() }}</button>\n@for (x of xs; track x) {\n<script>const a = 1;</script><style>a { color: red }</style>';
  it("colours tags, attributes, values, comments, interpolation and control flow", () => {
    has(code, "html", "button", "tag");
    has(code, "html", "class", "attr");
    has(code, "html", "[disabled]", "attr");
    has(code, "html", "(click)", "attr");
    has(code, "html", '"a"', "string");
    has(code, "html", "<!-- hi -->", "comment");
    has(code, "html", "label", "function");
    has(code, "html", "@for", "keyword");
    has(code, "html", "const", "keyword");
    has(code, "html", "color", "property");
  });
});

describe("css", () => {
  it("tells selectors from declarations, also nested in at-rules", () => {
    const code = "@media (min-width: 40rem) {\n  a:hover, .btn > #id { color: #fff; margin: 0 -1.5rem !important; background: var(--x) }\n}\n/* c */";
    has(code, "css", "@media", "keyword");
    has(code, "css", "a", "tag");
    has(code, "css", ":hover", "keyword");
    has(code, "css", ".btn", "type");
    has(code, "css", "color", "property");
    has(code, "css", "#fff", "number");
    has(code, "css", "-1.5rem", "number");
    has(code, "css", "!important", "keyword");
    has(code, "css", "var", "function");
    has(code, "css", "--x", "property");
    has(code, "css", "/* c */", "comment");
  });
});

describe("bash", () => {
  it("colours commands, flags, variables, strings, comments and keywords", () => {
    const code = 'FOO=1 npm run build --silent | grep "x" # note\nif [ -f "$f" ]; then echo ${HOME} $(pwd); fi';
    has(code, "bash", "FOO", "property");
    has(code, "bash", "npm", "function");
    has(code, "bash", "--silent", "attr");
    has(code, "bash", "grep", "function");
    has(code, "bash", '"x"', "string");
    has(code, "bash", "# note", "comment");
    has(code, "bash", "if", "keyword");
    has(code, "bash", "echo", "function");
    has(code, "bash", "${HOME}", "property");
    has(code, "bash", "pwd", "function");
  });
});

describe("text", () => {
  it("is one plain token per non-empty line", () => {
    expect(tokenize("a b\n\nc", "text")).toEqual([[{ text: "a b", kind: "plain" }], [], [{ text: "c", kind: "plain" }]]);
    expect(tokenize("", "ts")).toEqual([[]]);
  });
});

describe("robustness", () => {
  const nasty = ['"unterminated', "'a\\", "/* never closed", "`tpl ${ never", '<div class="x', "<!-- x", "{{ a", "<script>var x = '", "<style>a{", "$(", "${", "\\", "a\r\nb\r\n", "\u0000\ud800", "<<<>>>", "{".repeat(50) + "}".repeat(5), "@@@@", "-0x", "1e+", "<a b=", "'", '"', "`", "/", "/*", "//"];
  it("round-trips every line and never throws, for every language", () => {
    for (const lang of LANGS)
      for (const code of nasty) {
        const lines = tokenize(code, lang);
        expect(joined(lines)).toEqual(code.split("\n"));
      }
  });
  it("round-trips random strings (fuzz)", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const alphabet = "abc XYZ019_$.,:;(){}[]<>=/*\\\"'`#@!-+\n\r\t&|%?~^åé ";
    for (let n = 0; n < 400; n++) {
      const len = Math.floor(rnd() * 80);
      let code = "";
      for (let i = 0; i < len; i++) code += alphabet[Math.floor(rnd() * alphabet.length)];
      for (const lang of LANGS) expect(joined(tokenize(code, lang))).toEqual(code.split("\n"));
    }
  });
  it("is linear on large and adversarial input", () => {
    const inputs = ["a ".repeat(200_000), "'".repeat(100_000), "/*".repeat(100_000), "<a ".repeat(50_000), "${".repeat(50_000), "{{".repeat(50_000), "x\n".repeat(100_000), "(".repeat(100_000), ":".repeat(100_000)];
    for (const lang of LANGS)
      for (const code of inputs) {
        const t = performance.now();
        const lines = tokenize(code, lang);
        expect(lines.length).toBeGreaterThan(0);
        expect(performance.now() - t).toBeLessThan(2000);
      }
  });
});
