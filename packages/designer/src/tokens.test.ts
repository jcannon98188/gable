// Design tokens (TASK-56.23): the CSS scanner, the token patch, the context classification, the token index on the
// `tokens-app` fixture (its own tokens next to gable-ui's theme.css), the `setToken` edit with undo, and the MCP tools.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyHunks } from "./server/edit/hunks.js";
import { EditService } from "./server/edit/service.js";
import { ShellBridge } from "./server/mcp/bridge.js";
import { createControlServer } from "./server/mcp/control.js";
import { checkProject } from "./server/projects.js";
import { TailwindService } from "./server/tailwind/api.js";
import { tokenService } from "./server/tokens/api.js";
import { scanCss, varRefs } from "./server/tokens/css-scan.js";
import { buildTokenIndex, canvasSelector, kindOf, schemeOf, scopeOf, type TokenIndex } from "./server/tokens/model.js";
import { planTokenEdit } from "./server/tokens/patch.js";

const FIXTURE = fileURLToPath(new URL("../test-fixtures/tokens-app", import.meta.url));
// Copies live under the repo's node_modules (ignored by git) so `@import "tailwindcss"` and `@gable/ui/theme.css` resolve.
const SCRATCH = fileURLToPath(new URL("../../../node_modules/.cache/gable-tokens-test", import.meta.url));
const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
function copyFixture(): string {
  mkdirSync(SCRATCH, { recursive: true });
  const root = mkdtempSync(join(SCRATCH, "app-"));
  cpSync(FIXTURE, root, { recursive: true });
  made.push(root);
  return root;
}
const STYLES = "src/styles.css";
const patch = (css: string, spot: Parameters<typeof planTokenEdit>[1]) => {
  const h = planTokenEdit(css, spot);
  if ("ok" in h) throw new Error(h.error);
  return applyHunks(css, h);
};
const rule = (text: string) => ({ kind: "rule" as const, text });
const at = (text: string) => ({ kind: "at" as const, text });

describe("tokens: scanning CSS", () => {
  it("finds blocks with their context, declarations with offsets, and imports", () => {
    const css = `@import "a.css";\n@import url(./b.css) layer(x);\n/* c */\n:root { --a: 1px; /* x */ --b: "a;b"; }\n@media (prefers-color-scheme: dark) {\n  :root {\n    --a: 2px\n  }\n}\n@theme inline {\n  --color-x: var(--a);\n  @keyframes k { from { opacity: 0 } }\n}\n`;
    const s = scanCss(css);
    expect(s.imports.map((i) => i.spec)).toEqual(["a.css", "./b.css"]);
    expect(s.blocks.map((b) => b.chain.map((f) => f.text).join(" "))).toEqual([":root", "@media (prefers-color-scheme: dark)", "@media (prefers-color-scheme: dark) :root", "@theme inline", "@theme inline @keyframes k", "@theme inline @keyframes k from"]);
    const decls = s.decls.map((d) => [d.property, d.value, s.blocks[d.block]!.chain.map((f) => f.text).join(" ")]);
    expect(decls).toEqual([
      ["--a", "1px", ":root"],
      ["--b", '"a;b"', ":root"],
      ["--a", "2px", "@media (prefers-color-scheme: dark) :root"],
      ["--color-x", "var(--a)", "@theme inline"],
      ["opacity", "0", "@theme inline @keyframes k from"],
    ]);
    const d = s.decls[2]!;
    expect(css.slice(d.valueStart, d.valueEnd)).toBe("2px");
    expect(varRefs("calc(var(--a) + var(--b, var(--c)))")).toEqual(["--a", "--b", "--c"]);
  });
});

describe("tokens: classifying a definition's context", () => {
  it("tells light, dark, theme switches and component scopes apart", () => {
    expect([schemeOf([rule(":root")]), scopeOf([rule(":root")])]).toEqual([null, "root"]);
    expect([schemeOf([rule(".dark")]), scopeOf([rule(".dark")])]).toEqual(["dark", "root"]);
    expect([schemeOf([rule(':root[data-theme="dark"]')]), scopeOf([rule(':root[data-theme="dark"]')])]).toEqual(["dark", "root"]);
    expect([schemeOf([at("@media (prefers-color-scheme: dark)"), rule(":root")]), scopeOf([at("@media (prefers-color-scheme: dark)"), rule(":root")])]).toEqual(["dark", "root"]);
    expect([schemeOf([at("@theme inline")]), scopeOf([at("@theme inline")])]).toEqual([null, "theme"]);
    expect(scopeOf([rule('[data-theme="ocean"]')])).toBe("variant");
    expect(scopeOf([rule(".card")])).toBe("scoped");
    expect(canvasSelector([rule(".card:hover, .x")])).toBe(".card");
    expect(canvasSelector([rule(":root")])).toBeNull();
    expect([kindOf("oklch(1 0 0)"), kindOf("#fff"), kindOf("0.625rem"), kindOf("calc(0.6rem - 4px)"), kindOf("1.5"), kindOf("ease-out")]).toEqual(["color", "color", "length", "length", "number", "other"]);
  });
});

describe("tokens: the patch", () => {
  const css = `:root {\n  --brand: red;\n  --gap: 4px;\n}\n\n@media (prefers-color-scheme: dark) {\n  :root {\n    --brand: pink;\n  }\n}\n`;

  it("changes only the value, in exactly the context named", () => {
    const out = patch(css, { name: "--brand", selector: ":root", atRules: ["@media (prefers-color-scheme: dark)"], value: "hotpink" });
    expect(out).toBe(css.replace("pink;", "hotpink;"));
    expect(patch(css, { name: "--brand", selector: ":root", atRules: [], value: "blue" })).toBe(css.replace("red", "blue"));
  });

  it("adds a declaration to an existing block, and appends a missing context", () => {
    expect(patch(css, { name: "--gap", selector: ":root", atRules: ["@media (prefers-color-scheme: dark)"], value: "6px" })).toBe(css.replace("    --brand: pink;\n", "    --brand: pink;\n    --gap: 6px;\n"));
    expect(patch(css, { name: "--brand", selector: ".dark", atRules: [], value: "#111" })).toBe(css + "\n.dark {\n  --brand: #111;\n}\n");
    expect(patch(":root{}", { name: "--a", selector: ":root", atRules: [], value: "1" })).toBe(":root{ --a: 1; }");
    expect(patch("", { name: "--a", selector: null, atRules: ["@theme"], value: "1" })).toBe("@theme {\n  --a: 1;\n}\n");
  });

  it("removes a declaration with its line", () => {
    expect(patch(css, { name: "--gap", selector: ":root", atRules: [], value: null })).toBe(css.replace("  --gap: 4px;\n", ""));
  });

  it("refuses a stale expectation, bad names and values", () => {
    const stale = planTokenEdit(css, { name: "--brand", selector: ":root", atRules: [], value: "x", expect: "green" });
    expect("ok" in stale && stale.code).toBe("stale");
    expect("ok" in planTokenEdit(css, { name: "brand", selector: ":root", atRules: [], value: "x" })).toBe(true);
    expect("ok" in planTokenEdit(css, { name: "--brand", selector: ":root", atRules: [], value: "red; color: blue" })).toBe(true);
    expect("ok" in planTokenEdit(css, { name: "--brand", selector: ":root", atRules: [], value: null, expect: "red" })).toBe(false);
  });
});

describe("tokens: the index of the fixture", () => {
  let root: string;
  let index: TokenIndex;
  beforeAll(async () => {
    root = copyFixture();
    index = await tokenService(root).index(new TailwindService(root));
  }, 60000);

  it("reads the project's tokens with light and dark values, and gable-ui's as read-only", () => {
    const brand = index.byName.get("--brand")!;
    expect(brand.light?.value).toBe("#ff0066");
    expect(brand.dark?.value).toBe("#ff6699");
    expect(brand.kind).toBe("color");
    expect(brand.defs.map((d) => [d.context, d.scope, d.scheme])).toEqual([
      [":root", "root", null],
      [".dark", "root", "dark"],
      ['[data-theme="ocean"]', "variant", null],
    ]);
    expect(brand.edit.light).toEqual({ file: STYLES, selector: ":root", atRules: [], expect: "#ff0066", override: false });
    expect(index.byName.get("--space-card")!.dark?.value).toBe("20px");

    const primary = index.byName.get("--primary")!;
    expect(primary.defs.every((d) => !d.editable && d.file === "@gable/ui/theme.css")).toBe(true);
    expect(primary.light?.value).toBe("oklch(0.205 0 0)");
    expect(primary.dark?.value).toBe("oklch(0.922 0 0)");
    // Package tokens are overridden in the stylesheet that imports them.
    expect(primary.edit.light).toEqual({ file: STYLES, selector: ":root", atRules: [], expect: null, override: true });
    expect(primary.edit.dark).toEqual({ file: STYLES, selector: ".dark", atRules: [], expect: null, override: true });
    expect(primary.aliases).toContain("--color-primary");
    // resolved through the alias
    expect(index.byName.get("--color-primary")!.light?.resolved).toBe("oklch(0.205 0 0)");
    expect(index.list.darkVia[0]).toBe(".dark");
    expect(index.list.sheets.find((s) => s.file === "@gable/ui/theme.css")).toMatchObject({ editable: false, importer: STYLES });
    // Tailwind's own default theme is left to Tailwind mode.
    expect(index.byName.has("--color-red-500")).toBe(false);
  });

  it("counts and lists uses: CSS var(), inline styles, and classes through the design system and aliases", () => {
    const uses = index.usages("--brand");
    const kinds = uses.map((u) => `${u.kind}:${u.className ?? u.property ?? ""}${u.via ? ` via ${u.via}` : ""}`).sort();
    expect(kinds).toEqual(["class:text-brand", "css:border", "style:"]);
    expect(index.byName.get("--brand")!.uses).toBe(3);
    const card = uses.find((u) => u.kind === "css")!;
    expect(card).toMatchObject({ file: STYLES, selector: ".card", context: ".card" });
    const cls = uses.find((u) => u.kind === "class")!;
    expect(cls.file).toBe("src/tokens-app.ts");
    expect(cls.raw!.slice(cls.offset!, cls.offset! + 3)).toBe("<h1");
    const primary = index.usages("--primary");
    expect(primary.some((u) => u.kind === "class" && u.className === "bg-primary")).toBe(true);
    // `@theme inline` tokens are written into the classes as the value they read: their uses are the classes named after them.
    expect(index.usages("--color-brand").map((u) => u.className)).toEqual(["text-brand"]);
    expect(index.usages("--color-primary").map((u) => u.className)).toEqual(["bg-primary"]);
    expect(index.usages("--color-primary-foreground").map((u) => u.className)).toEqual(["text-primary-foreground"]);
    // theme.css's own `@apply`-free rules are in a package: read-only uses.
    expect(index.usages("--radius").find((u) => u.file === STYLES)?.property).toBe("border-radius");
  });

  it("names the tokens an element reads", () => {
    expect(index.elementTokens("card", "")).toEqual(
      expect.arrayContaining([
        { name: "--space-card", via: ".card rule" },
        { name: "--brand", via: ".card rule" },
        { name: "--radius", via: ".card rule" },
      ]),
    );
    expect(index.elementTokens("bg-primary text-primary-foreground", "")).toEqual([
      { name: "--primary", via: "class bg-primary" },
      { name: "--primary-foreground", via: "class text-primary-foreground" },
    ]);
    expect(index.elementTokens("", "color: var(--brand)")).toEqual([{ name: "--brand", via: "style" }]);
  });

  it("works without Tailwind: classes are matched by the var() they spell", () => {
    const plain = buildTokenIndex(root, null);
    expect(plain.list.tailwind).toBe(false);
    expect(plain.usages("--brand").map((u) => u.kind).sort()).toEqual(["css", "style"]);
  });
});

describe("tokens: editing through the edit service", () => {
  it("writes one value, keeps CRLF, and undo puts the file back byte for byte", () => {
    const root = copyFixture();
    const file = join(root, STYLES);
    const crlf = readFileSync(file, "utf8").replaceAll("\n", "\r\n");
    writeFileSync(file, crlf);
    const edits = new EditService(root);
    const r = edits.apply({ op: "setToken", file: STYLES, name: "--brand", selector: ".dark", atRules: [], value: "#00aa55", expect: "#ff6699" });
    expect(r).toMatchObject({ ok: true, label: "Set --brand (.dark)", file: STYLES });
    expect(readFileSync(file, "utf8")).toBe(crlf.replace(".dark {\r\n  --brand: #ff6699;", ".dark {\r\n  --brand: #00aa55;"));
    expect(edits.history().last?.diff.added).toBe(1);
    expect(edits.undo().ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(crlf);
    expect(edits.redo().ok).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("--brand: #00aa55;");
  });

  it("refuses a stale edit and anything outside the project", () => {
    const root = copyFixture();
    const edits = new EditService(root);
    expect(edits.apply({ op: "setToken", file: STYLES, name: "--brand", selector: ":root", value: "red", expect: "#000" })).toMatchObject({ ok: false, code: "stale" });
    expect(edits.apply({ op: "setToken", file: "../x.css", name: "--brand", selector: ":root", value: "red" })).toMatchObject({ ok: false });
    expect(edits.apply({ op: "setToken", file: "src/main.ts", name: "--brand", selector: ":root", value: "red" })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("tokens: MCP", () => {
  const textOf = (r: CallToolResult) => (r.content as Array<{ type: string; text?: string }>).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const jsonOf = <T>(r: CallToolResult): T => {
    if (r.isError) throw new Error(textOf(r));
    return JSON.parse(textOf(r)) as T;
  };

  it("lists tokens, finds usages and sets light and dark values with undo", async () => {
    const root = copyFixture();
    const bridge = new ShellBridge();
    const edits = new EditService(root);
    let history = 0;
    const server = createControlServer({
      root,
      info: { root, name: "tokens-fixture", previewUrl: "http://localhost:1", ready: true, error: null, server: "running", installing: false, check: checkProject(root) },
      edits,
      tailwind: new TailwindService(root),
      bridge,
      diagnostics: async () => ({ at: 0, configErrors: [], diagnostics: [] }),
      historyChanged: () => void history++,
      cdpPort: null,
      shellOrigins: () => [],
      browser: null,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(["list_tokens", "get_token_usages", "set_token"]));

      const list = jsonOf<{ tokens: Array<{ name: string; uses: number; light: { value: string }; definitions: Array<{ context: string }> }>; darkVia: string[] }>(await call("list_tokens", { filter: "brand" }));
      const brand = list.tokens.find((t) => t.name === "--brand")!;
      expect(brand.light.value).toBe("#ff0066");
      expect(brand.uses).toBe(3);
      expect(brand.definitions.map((d) => d.context)).toContain('[data-theme="ocean"]');

      const usages = jsonOf<{ count: number; usages: Array<{ kind: string; select: { target?: { file: string; line: number }; selector?: string } | null }> }>(await call("get_token_usages", { name: "--brand" }));
      expect(usages.count).toBe(3);
      expect(usages.usages.find((u) => u.kind === "css")!.select).toEqual({ selector: ".card" });
      expect(usages.usages.find((u) => u.kind === "class")!.select!.target!.file).toBe("src/tokens-app.ts");
      expect((await call("get_token_usages", { name: "--nope" })).isError).toBe(true);

      const before = readFileSync(join(root, STYLES), "utf8");
      const set = jsonOf<{ diff: string; label: string }>(await call("set_token", { name: "--brand", value: "#123456" }));
      expect(set.label).toBe("Set --brand (:root)");
      expect(set.diff).toContain("-  --brand: #ff0066;");
      expect(set.diff).toContain("+  --brand: #123456;");
      expect(history).toBe(1);

      // A package token: the dark value is written as an override in the project's stylesheet.
      const dark = jsonOf<{ diff: string; note: string }>(await call("set_token", { name: "--primary", value: "oklch(0.7 0.1 250)", scheme: "dark" }));
      expect(dark.note).toContain("override");
      expect(readFileSync(join(root, STYLES), "utf8")).toMatch(/\.dark \{\n {2}--brand: #ff6699;\n {2}--primary: oklch\(0\.7 0\.1 250\);\n\}/);

      const ocean = jsonOf<{ diff: string }>(await call("set_token", { name: "--brand", value: "#0088ff", context: '[data-theme="ocean"]' }));
      expect(ocean.diff).toContain("+  --brand: #0088ff;");
      expect((await call("set_token", { name: "--brand", value: "x", context: ".nope" })).isError).toBe(true);

      for (let i = 0; i < 3; i++) jsonOf(await call("undo"));
      expect(readFileSync(join(root, STYLES), "utf8")).toBe(before);
    } finally {
      await client.close();
    }
  }, 60000);
});
