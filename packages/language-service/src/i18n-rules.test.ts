import { describe, expect, it } from "vitest";
import { check, where } from "../test-support/check.js";
import { PLUGIN_NAME, readConfig } from "./config.js";

describe("i18n marker rules", () => {
  it("passes correct markers, including a bound attribute with no marker", async () => {
    const { code, diagnostics } = await check("i18n-pass");
    expect(diagnostics).toEqual([]);
    expect(code).toBe(0);
  });

  it("reports each marker mistake at the marker", async () => {
    const { code, diagnostics } = await check("i18n-fail");
    const at = (snippet: string, into = 0) => where("i18n-fail", snippet, into);
    const expected: Array<[string, { line: number; column: number }, string]> = [
      ["i18n-empty", at('i18n="nothing"'), "warn"],
      ["i18n-empty", at("<p i18n>{{", 3), "warn"],
      ["i18n-not-translatable", at('i18n="mixed"'), "error"],
      ["i18n-attr-missing", at("i18n-title=\"missing\""), "error"],
      ["i18n-not-translatable", at("i18n-title=\"bound\""), "error"],
      ["i18n-marker-syntax", at('i18n="empty id@@"'), "error"],
    ];
    expect(diagnostics.map((d) => [d.rule, d.line, d.column, d.severity])).toEqual(expected.map(([rule, p, severity]) => [rule, p.line, p.column, severity]));
    expect(code).toBe(1);
  });

  it("explains what to do", async () => {
    const { diagnostics } = await check("i18n-fail");
    const message = (rule: string, text: string) => diagnostics.find((d) => d.rule === rule && d.message.includes(text))?.message;
    expect(message("i18n-attr-missing", "i18n-title")).toMatch(/has no title="..." attribute/);
    expect(message("i18n-not-translatable", "[title]")).toMatch(/only static text is translated/);
    expect(message("i18n-marker-syntax", "id")).toMatch(/Empty id/);
  });
});

describe("i18n-missing-translation", () => {
  it("is silent when the config has no i18n section (the marker fixtures)", async () => {
    expect((await check("i18n-pass")).diagnostics.filter((d) => d.rule === "i18n-missing-translation")).toEqual([]);
  });

  it("reports each marked message with the locales it has no translation for, at its marker", async () => {
    const { code, diagnostics } = await check("i18n-missing");
    const at = (snippet: string, into = 0) => where("i18n-missing", snippet, into);
    const rows = diagnostics.map((d) => [d.rule, d.line, d.column, d.severity, d.message]);
    const expected = [
      [at('i18n="page title"'), "es"],
      [at("<p i18n>", 3), "de, es"],
      [at('i18n-title="search field"'), "fr, de, es"],
      [at('i18n="@@note"'), "es"],
      [at("<b i18n>", 3), "es"], // the id is of the decoded message "a < b", which fr and de have
    ] as const;
    expect(rows).toEqual(
      expected.map(([p, locales]) => [
        "i18n-missing-translation",
        p.line,
        p.column,
        "warn",
        expect.stringContaining(`has no translation for ${locales}`),
      ]),
    );
    expect(diagnostics[0]!.message).toMatch(/no readable catalog for es/);
    expect(diagnostics[2]!.message).toMatch(/^"Search" \(id 8bd803ecc83852a3\)/);
    expect(code).toBe(0); // warnings only
  });
});

describe("i18n-missing-translation in code", () => {
  it("checks i18n tags and .t tags on the I18n service, and nothing else named t", async () => {
    const { code, diagnostics } = await check("i18n-missing-code");
    const at = (snippet: string) => where("i18n-missing-code", snippet);
    const expected = [
      [at("i18n`Inbox"), "Inbox ({0})", "c5d748f038bcd45e", "de"],
      [at("i18n`Click"), "Click to refresh", "b1b3cbc6097ff8bd", "fr, de"],
      [at("this.#i18n.t"), "{0} items", "2e8c7859ff2c78c7", "fr"],
      [at("inject(I18n).t`All"), "All done", "a3fb90ba3a7b7424", "de"],
    ] as const;
    expect(diagnostics.map((d) => [d.rule, d.line, d.column, d.severity, d.message])).toEqual(
      expected.map(([p, message, id, locales]) => ["i18n-missing-translation", p.line, p.column, "warn", `"${message}" (id ${id}) has no translation for ${locales}`]),
    );
    expect(code).toBe(0); // warnings only
  });
});

describe("i18n-unmarked-text", () => {
  it("is off by default", async () => {
    expect((await check("i18n-pass")).diagnostics.filter((d) => d.rule === "i18n-unmarked-text")).toEqual([]);
  });

  it("flags unmarked words, text and attributes, and skips the rest", async () => {
    const { diagnostics } = await check("i18n-unmarked");
    const at = (snippet: string, into = 0) => where("i18n-unmarked", snippet, into);
    const expected = [
      at("Unmarked heading"),
      at("Hello {{ name() }}, nice"),
      at('title="Search"'),
      at('alt="Logo"'),
      at("Inside a block"),
      at("Tom &amp; Jerry"), // character references decode first: "&lt; &amp;&amp;" has no words, and the position is still the source offset
    ];
    expect(diagnostics.map((d) => [d.rule, d.line, d.column, d.severity])).toEqual(expected.map((p) => ["i18n-unmarked-text", p.line, p.column, "warn"]));
    expect(diagnostics[0]!.message).toMatch(/Text "Unmarked heading" is not marked.*i18n-ignore/);
    expect(diagnostics.at(-1)!.message).toMatch(/Text "Tom & Jerry" is not marked/);
  });
});

describe("i18n plugin option", () => {
  const read = (i18n: unknown) => readConfig({ configFilePath: "/p/tsconfig.json", plugins: [{ name: PLUGIN_NAME, i18n }] } as never);

  it("defaults the catalog path and drops the source locale from the checked locales", () => {
    const { config, errors } = read({ locales: ["en", "fr"] });
    expect(errors).toEqual([]);
    expect(config.i18n).toMatchObject({ sourceLocale: "en", locales: ["fr"], catalogs: "src/locales/messages.{locale}.json" });
  });

  it("explains a bad section, and accepts the other gableI18n options without using them", () => {
    expect(read({ locales: "fr" }).errors[0]).toMatch(/i18n\.locales/);
    expect(read({ locales: ["fr"], catalogs: "messages.json" }).errors[0]).toMatch(/\{locale\}/);
    expect(read({ locales: ["fr"], banana: 1 }).errors[0]).toMatch(/unknown option "i18n\.banana"/);
    expect(read({ locales: ["fr"], bake: true, extract: false }).errors).toEqual([]);
  });
});
