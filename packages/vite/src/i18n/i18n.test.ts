import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { messageId } from "@gable/core/tooling";
import { describe, expect, it } from "vitest";
import { bakeSource, dynamicCalls } from "./bake.js";
import { readCatalogFile, writeCatalogs } from "./catalogs.js";
import { extractFromSource, extractProject } from "./extract.js";
import { setHtmlLang } from "./plugin.js";
import { scanTemplates } from "./scan.js";

const sample = [
  'import { html, i18n, signal } from "@gable/core";',
  "export class Inbox {",
  "  static meta = {",
  "    selector: 'x-inbox',",
  "    template: html`",
  '      <h1 i18n="page title">Welcome</h1>',
  "      <p i18n>Hello {{ name() }}, you have {{ count() }} messages</p>",
  '      <input title="Search" i18n-title="search field" placeholder="Name" />',
  '      <p class="plain">Not translated</p>',
  "    `,",
  "  };",
  "  name = signal('Ada');",
  "  count = signal(3);",
  "  title = i18n`Inbox of ${this.name} (${this.count})`;",
  "  tip = i18n`:tooltip@@tip:Click to refresh`;",
  "}",
].join("\n");

const id = messageId;

describe("scanner", () => {
  it("finds html and i18n templates, not look-alikes in strings, comments, regexes or other tags", () => {
    const code = [
      'const a = "html`<p i18n>no</p>`";',
      "// i18n`comment`",
      "const r = /`/.test(x); const s = css`i18n`; const t = this.i18n`not the tag`;",
      "const ok = html`<p i18n>yes</p>`;",
      "const nested = i18n`a ${html`<b i18n>deep</b>`} b`;",
    ].join("\n");
    const hits = scanTemplates(code);
    expect(hits.map((h) => h.tag)).toEqual(["html", "i18n", "html"]);
    expect(hits[0]!.raw).toEqual(["<p i18n>yes</p>"]);
    expect(hits[1]!.raw).toEqual(["a ", " b"]);
    expect(hits[1]!.holes).toHaveLength(1);
  });
});

describe("extraction", () => {
  it("reads templates and tagged templates, with descriptions, ids and locations", () => {
    const found = extractFromSource(sample, "src/inbox.ts");
    expect(found.map((m) => m.message)).toEqual([
      "Welcome",
      "Hello {0}, you have {1} messages",
      "Search",
      "Inbox of {0} ({1})",
      "Click to refresh",
    ]);
    expect(found[0]).toMatchObject({ id: id("Welcome", "page title"), description: "page title", location: "src/inbox.ts:6" });
    expect(found[1]!.placeholders).toEqual(["name()", "count()"]);
    expect(found[2]).toMatchObject({ description: "search field" });
    expect(found[3]!.placeholders).toEqual(["this.name", "this.count"]);
    expect(found[4]).toMatchObject({ id: "tip", description: "tooltip" });
  });

  it("reports a marker mistake with its file and line", () => {
    expect(() => extractFromSource("const t = html`\n<p i18n-title>x</p>`;", "a.ts")).toThrow(/a\.ts:1:.*i18n-title/s);
  });
});

function bake(code: string, catalog: Record<string, string>) {
  const missing: string[] = [];
  const result = bakeSource(code, "src/inbox.ts", { translate: (k) => catalog[k], missing: (m) => missing.push(m.id) });
  return { ...result, missing };
}

describe("baking", () => {
  const fr = {
    [id("Welcome", "page title")]: "Bienvenue",
    [id("Hello {0}, you have {1} messages", "")]: "{1} messages pour {0}, bonjour",
    [id("Search", "search field")]: "Rechercher",
    [id("Inbox of {0} ({1})", "")]: "Boîte de {0} : {1}",
    tip: "Cliquer pour actualiser",
  };

  it("translates text and attributes, reorders placeholders and removes every marker", () => {
    const { code, missing, count } = bake(sample, fr);
    expect(missing).toEqual([]);
    expect(count).toBe(5);
    expect(code).toContain("<h1>Bienvenue</h1>");
    expect(code).toContain("<p>{{ count() }} messages pour {{ name() }}, bonjour</p>"); // reordered
    expect(code).toContain('<input title="Rechercher" placeholder="Name" />'); // attribute translated, marker gone
    expect(code).toContain('<p class="plain">Not translated</p>');
    expect(code).not.toMatch(/i18n-|<h1 i18n|<p i18n/);
    expect(code).toContain("__gableComputed(() => `Boîte de ${__gableValue(this.name)} : ${__gableValue(this.count)}`)"); // tag reordered
    expect(code).toContain("__gableComputed(() => `Cliquer pour actualiser`)");
    expect(code).not.toMatch(/\bi18n`/);
  });

  it("without translations (the source locale) only strips markers and keeps the source text", () => {
    const { code, missing } = bake(sample, {});
    expect(missing).toHaveLength(5);
    expect(code).toContain("<h1>Welcome</h1>");
    expect(code).toContain("<p>Hello {{ name() }}, you have {{ count() }} messages</p>");
    expect(code).toContain("__gableComputed(() => `Inbox of ${__gableValue(this.name)} (${__gableValue(this.count)})`)");
  });

  it("reports each message that has no translation and falls back to its source text", () => {
    const { code, missing } = bake(sample, { [id("Welcome", "page title")]: "Bienvenue" });
    expect(missing).toEqual([id("Hello {0}, you have {1} messages", ""), id("Search", "search field"), id("Inbox of {0} ({1})", ""), "tip"]);
    expect(code).toContain("<h1>Bienvenue</h1>");
    expect(code).toContain("<p>Hello {{ name() }}, you have {{ count() }} messages</p>");
  });

  it("leaves modules without markers alone", () => {
    const plain = "export const t = html`<p>hi</p>`;";
    expect(bake(plain, {}).code).toBe(plain);
  });

  it("rejects translations a baked build cannot format, and placeholders that do not exist", () => {
    const key = id("Hello {0}, you have {1} messages", "");
    expect(() => bake(sample, { [key]: "{1, plural, one {# message} other {# messages}}" })).toThrow(/plural.*runtime mode/s);
    expect(() => bake(sample, { [key]: "Bonjour {5}" })).toThrow(/uses \{5\}/);
    expect(() => bake(sample, { [key]: "a < b" })).toThrow(/cannot be baked/);
  });

  it("escapes what would break the surrounding template literal", () => {
    const { code } = bake("const t = i18n`Price ${p}`;", { [id("Price {0}", "")]: "Prix `x` \\\\ {0}" });
    expect(code).toContain("`Prix \\`x\\` \\\\ ${__gableValue(p)}`");
  });
});

describe("catalog files", () => {
  const root = mkdtempSync(join(tmpdir(), "gable-i18n-"));
  it("writes the source catalog, merges existing translations and marks new and obsolete ones", () => {
    const src = join(root, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "inbox.ts"), sample);
    const options = { root, sourceLocale: "en", locales: ["fr"], catalogs: "locales/{locale}.json", xliff: "locales/{locale}.xlf" };
    const first = writeCatalogs(extractProject(root), options);
    expect(first).toEqual([{ locale: "fr", untranslated: expect.any(Array), obsolete: [] }]);
    expect(first[0]!.untranslated).toHaveLength(5);
    const source = JSON.parse(readFileSync(join(root, "locales/en.json"), "utf8"));
    expect(source.translations[id("Welcome", "page title")]).toBe("Welcome");

    // A translator fills in one message; the source then loses one and gains one.
    const frPath = join(root, "locales/fr.json");
    const fr = JSON.parse(readFileSync(frPath, "utf8"));
    fr.translations[id("Welcome", "page title")] = "Bienvenue";
    fr.translations[id("Search", "search field")] = "Rechercher";
    writeFileSync(frPath, JSON.stringify(fr));
    writeFileSync(join(src, "inbox.ts"), sample.replace(' i18n-title="search field"', "").replace("</h1>", "</h1><h2 i18n>Fresh</h2>"));
    const second = writeCatalogs(extractProject(root), options);
    expect(second[0]!.obsolete).toEqual([id("Search", "search field")]);
    expect(second[0]!.untranslated).toContain(id("Fresh", ""));
    const after = readCatalogFile(frPath);
    expect(after.translations[id("Welcome", "page title")]).toBe("Bienvenue");
    expect(after.obsolete[id("Search", "search field")]).toBe("Rechercher");
    const xlf = readFileSync(join(root, "locales/fr.xlf"), "utf8");
    expect(xlf).toContain('target-language="fr"');
    expect(xlf).toContain("<target>Bienvenue</target>");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("inject(I18n).t tag calls", () => {
  const code = [
    "class Cart {",
    "  #i18n = inject(I18n);",
    "  label = computed(() => this.#i18n.t`:cart@@cart:${this.items()} items`);",
    "  other = inject(I18n).t`Saved`;",
    "  nope = other.t`Not the service`;",
    "}",
  ].join("\n");

  it("scans and extracts them like the i18n tag, covering the whole receiver", () => {
    const hits = scanTemplates(code);
    expect(hits.map((h) => h.tag)).toEqual(["t", "t"]);
    expect(code.slice(hits[0]!.tagStart, hits[0]!.start - 1)).toBe("this.#i18n.t");
    expect(code.slice(hits[1]!.tagStart, hits[1]!.start - 1)).toBe("inject(I18n).t");
    const found = extractFromSource(code, "src/cart.ts");
    expect(found.map((m) => [m.id, m.message, m.description])).toEqual([
      ["cart", "{0} items", "cart"],
      [id("Saved", ""), "Saved", ""],
    ]);
  });

  it("bakes them into plain template literals, and keeps the source map", () => {
    const result = bake(code, { cart: "{0} articles", [id("Saved", "")]: "Enregistré" });
    expect(result.code).toContain("label = computed(() => `${__gableValue(this.items())} articles`);");
    expect(result.code).toContain("other = `Enregistré`;");
    expect(result.code).toContain("other.t`Not the service`");
    expect(result.code).not.toContain("__gableComputed"); // no import needed for plain strings
    expect(result.code).toContain("const __gableValue");
    expect(result.map?.mappings).toBeTruthy();
    expect(result.map?.sources).toEqual(["src/inbox.ts"]);
  });

  it("finds dynamic calls that stay runtime-only", () => {
    const dynamic = "const a = this.i18n.t(parts, 1);\nconst b = inject(I18n).translate(id, 'x');\nconst c = this.i18n.t`ok`;";
    expect(dynamicCalls(dynamic)).toEqual([1, 2]);
  });
});

describe("html lang", () => {
  it("adds or replaces the lang attribute on <html>", () => {
    expect(setHtmlLang("<!doctype html><html><head></head></html>", "fr")).toContain('<html lang="fr">');
    expect(setHtmlLang('<html lang="en" class="x">', "de-CH")).toBe('<html lang="de-CH" class="x">');
    expect(setHtmlLang("<div></div>", "fr")).toBe("<div></div>");
  });
});

describe("i18n-ignore", () => {
  it("is removed from baked templates and does not count as a marker", () => {
    const code = "const t = html`<h1 i18n>Welcome</h1><p i18n-ignore class=\"x\">Acme</p>`;";
    const { code: out, count } = bake(code, { [id("Welcome", "")]: "Bienvenue" });
    expect(count).toBe(1);
    expect(out).toContain("<h1>Bienvenue</h1><p class=\"x\">Acme</p>");
  });
});
