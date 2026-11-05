import { describe, expect, it } from "vitest";
import { formatTemplateLiterals, runCli, type CliIo } from "./index.js";

describe("formatTemplateLiterals: only html template literals are edited", () => {
  it("rewrites html literals with the indentation of their line and leaves every other byte alone", () => {
    const src = [
      "import { html } from '@gable/core';",
      "// html`<p>  comment </p>`",
      'const s = "html`<p>  string </p>`";',
      "const c = css`a   {  color: red }`;",
      "const t = `<p>  plain   template </p>`;",
      "class A {",
      "  static meta = {",
      "    template: html`<div><p>hi</p><span>{{a()}}</span></div>`,",
      "  };",
      "}",
      "",
    ].join("\n");
    expect(formatTemplateLiterals(src)).toBe(
      [
        "import { html } from '@gable/core';",
        "// html`<p>  comment </p>`",
        'const s = "html`<p>  string </p>`";',
        "const c = css`a   {  color: red }`;",
        "const t = `<p>  plain   template </p>`;",
        "class A {",
        "  static meta = {",
        "    template: html`",
        "      <div>",
        "        <p>hi</p>",
        "        <span>{{ a() }}</span>",
        "      </div>",
        "    `,",
        "  };",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("keeps ${} holes (including nested template literals) byte-identical and is idempotent", () => {
    const src = "const x = html`<ul>${ items.map((i) => html`<li>${i}</li>`) }</ul>`;\n";
    const once = formatTemplateLiterals(src);
    expect(once).toContain("${ items.map((i) => html`<li>${i}</li>`) }");
    expect(formatTemplateLiterals(once)).toBe(once);
  });

  it("keeps a short single-line literal on one line", () => {
    expect(formatTemplateLiterals("const x = html`<p>  hi </p>`;")).toBe("const x = html`<p>hi</p>`;");
  });

  it("supports a configurable tag and tabs", () => {
    const src = "if (a) {\n\tconst x = tpl`<div><p>a</p></div>`;\n}\n";
    expect(formatTemplateLiterals(src, { tag: "tpl", useTabs: true })).toBe(
      "if (a) {\n\tconst x = tpl`\n\t\t<div>\n\t\t\t<p>a</p>\n\t\t</div>\n\t`;\n}\n",
    );
    expect(formatTemplateLiterals(src)).toBe(src);
  });

  it("is not fooled by regex literals, division, or comments containing backticks", () => {
    const src = "const r = /`/; const d = a / 2; /* ` */ const h = html`<p> x </p>`;\n";
    expect(formatTemplateLiterals(src)).toBe("const r = /`/; const d = a / 2; /* ` */ const h = html`<p>x</p>`;\n");
  });
});

describe("gable-format CLI", () => {
  const mem = (files: Record<string, string>, stdin = "") => {
    const out: string[] = [];
    const io: CliIo = {
      readFile: (p) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      writeFile: (p, c) => void (files[p] = c),
      readStdin: () => stdin,
      stdout: (s) => void out.push(s),
      stderr: (s) => void out.push("ERR:" + s),
    };
    return { io, out, files };
  };

  it("rewrites files in place", () => {
    const m = mem({ "a.ts": "const x = html`<p>  a </p>`;\n", "b.ts": "const y = 1;\n" });
    expect(runCli(["a.ts", "b.ts"], m.io)).toBe(0);
    expect(m.files["a.ts"]).toBe("const x = html`<p>a</p>`;\n");
    expect(m.files["b.ts"]).toBe("const y = 1;\n");
  });

  it("reads stdin and writes stdout with --stdin", () => {
    const m = mem({}, "const x = html`<p>  a </p>`;\n");
    expect(runCli(["--stdin"], m.io)).toBe(0);
    expect(m.out.join("")).toBe("const x = html`<p>a</p>`;\n");
  });

  it("--check exits 1 and writes nothing when a file would change", () => {
    const m = mem({ "a.ts": "const x = html`<p>  a </p>`;\n" });
    expect(runCli(["--check", "a.ts"], m.io)).toBe(1);
    expect(m.files["a.ts"]).toBe("const x = html`<p>  a </p>`;\n");
  });

  it("passes formatting options", () => {
    const m = mem({}, "const x = html`<div><p>a</p></div>`;");
    runCli(["--stdin", "--tab-width", "4", "--tag", "html"], m.io);
    expect(m.out.join("")).toBe("const x = html`\n    <div>\n        <p>a</p>\n    </div>\n`;");
  });
});
