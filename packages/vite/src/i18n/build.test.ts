import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBuilder, createServer } from "vite";
import { describe, expect, it } from "vitest";
import { gable } from "../index.js";
import { sampleApp } from "../test-server.js";
import { gableI18n, type GableI18nOptions } from "./plugin.js";
import { messageId } from "@gable/core/tooling";

const APP = `import { html, i18n, signal } from "@gable/core";

export class App {
  static meta = {
    selector: "app-root",
    template: html\`
      <h1 i18n="page title">Welcome</h1>
      <p class="greeting" i18n>Hello {{ name() }}, you have {{ count() }} messages</p>
      <input class="search" title="Search" i18n-title="search field" />
      <button class="inc" (click)="inc()">+</button>
      <span class="count">{{ count() }}</span>
      <span class="status">{{ status() }}</span>
    \`,
  };
  name = signal("Ada");
  count = signal(3);
  status = i18n\`Inbox of \${this.name} (\${this.count})\`;
  inc() {
    this.count.update((n) => n + 1);
  }
}
`;

const catalog = (locale: string, translations: Record<string, string>) => JSON.stringify({ locale, translations }, null, 2);

function i18nApp(options: Partial<GableI18nOptions> = {}, catalogs: Record<string, Record<string, string>> | null = null) {
  const app = sampleApp();
  writeFileSync(join(app.root, "src/app.ts"), APP);
  mkdirSync(join(app.root, "src/locales"), { recursive: true });
  const full = {
    fr: {
      [messageId("Welcome", "page title")]: "Bienvenue",
      [messageId("Hello {0}, you have {1} messages", "")]: "{1} messages pour {0}, bonjour",
      [messageId("Search", "search field")]: "Rechercher",
      [messageId("Inbox of {0} ({1})", "")]: "Boîte de {0} : {1}",
    },
    de: {
      [messageId("Welcome", "page title")]: "Willkommen",
      [messageId("Hello {0}, you have {1} messages", "")]: "Hallo {0}, du hast {1} Nachrichten",
      [messageId("Search", "search field")]: "Suchen",
      [messageId("Inbox of {0} ({1})", "")]: "Posteingang von {0} ({1})",
    },
  };
  for (const [locale, translations] of Object.entries(catalogs ?? full)) {
    writeFileSync(join(app.root, `src/locales/messages.${locale}.json`), catalog(locale, translations));
  }
  const config = { ...app.config, plugins: [gable(), gableI18n({ locales: ["fr", "de"], extract: false, bake: true, ...options })], build: { minify: false } };
  return { ...app, config, run: async () => (await createBuilder(config)).buildApp() };
}

const bundleOf = (dir: string) =>
  readdirSync(join(dir, "assets"))
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(dir, "assets", f), "utf8"))
    .join("\n");

describe("baked builds", () => {
  it("emits one output per locale with translated text, reordered placeholders and no markers", { timeout: 90_000 }, async () => {
    const app = i18nApp();
    try {
      await app.run();
      const out = (locale: string) => join(app.root, "dist", locale);
      for (const locale of ["en", "fr", "de"]) expect(existsSync(join(out(locale), "index.html")), locale).toBe(true);

      const fr = bundleOf(out("fr"));
      expect(fr).toContain("Bienvenue");
      expect(fr).toContain("{{ count() }} messages pour {{ name() }}, bonjour"); // reordered
      expect(fr).toContain('title="Rechercher"');
      expect(fr).toContain("Boîte de ");
      expect(fr).not.toContain("Welcome");

      const de = bundleOf(out("de"));
      expect(de).toContain("Willkommen");
      expect(de).toContain("Hallo {{ name() }}, du hast {{ count() }} Nachrichten");

      const en = bundleOf(out("en"));
      expect(en).toContain("Welcome");
      expect(en).toContain("Hello {{ name() }}, you have {{ count() }} messages");

      for (const locale of ["en", "fr", "de"]) {
        const code = bundleOf(out(locale));
        // Doc comments survive in the bundle (core has `template: html` in an @example), so look past them.
        const template = /template: html`([^`]*)`/.exec(code.replace(/\/\*[\s\S]*?\*\//g, ""))![1]!;
        expect(template, locale).not.toMatch(/i18n/); // no markers left in the app's template
        expect(template, locale).toContain("<h1>");
        expect(code, locale).not.toMatch(/provideI18n|setLocale|selectordinal|formatMessage|parseMessage|class I18n/); // no i18n service or ICU formatter
        expect(code, locale).not.toContain("messages.fr.json"); // no catalog shipped
      }
    } finally {
      app.remove();
    }
  });

  it("sets <html lang> per locale (unless disabled) and bakes inject(I18n).t calls with a source map", { timeout: 90_000 }, async () => {
    for (const htmlLang of [true, false]) {
      const app = i18nApp({ locales: ["fr"], bake: { htmlLang, onMissing: "source" } }, { fr: { [messageId("Welcome", "page title")]: "Bienvenue", [messageId("Saved", "")]: "Enregistré" } });
      const withT = `import { inject, I18n } from "@gable/core";\n${APP}\nexport class Cart { #i18n = inject(I18n); saved = this.#i18n.t\`Saved\`; }\n(globalThis as Record<string, unknown>).cart = Cart;\n`;
      writeFileSync(join(app.root, "src/app.ts"), withT);
      try {
        await ((await createBuilder({ ...app.config, build: { minify: false, sourcemap: true } })).buildApp());
        const html = (locale: string) => readFileSync(join(app.root, "dist", locale, "index.html"), "utf8");
        if (htmlLang) {
          expect(html("fr")).toContain('<html lang="fr">');
          expect(html("en")).toContain('<html lang="en">');
        } else expect(html("fr")).not.toContain("lang=");
        const fr = bundleOf(join(app.root, "dist/fr"));
        expect(fr).toContain("Enregistré");
        expect(fr).not.toMatch(/#i18n\.t`/);
        const maps = readdirSync(join(app.root, "dist/fr/assets")).filter((f) => f.endsWith(".map"));
        expect(maps.length).toBeGreaterThan(0);
      } finally {
        app.remove();
      }
    }
  });

  it("bakes plural, select, number and date forms of code messages with no ICU parser in the bundle", { timeout: 90_000 }, async () => {
    const app = i18nApp({ locales: ["fr"], bake: { onMissing: "source" } }, {
      fr: {
        [messageId("{0} items", "")]: "{0, plural, one {# objet} other {# objets}}",
      },
    });
    const withForms = `${APP}
export const label = (i18n: { t(s: TemplateStringsArray, ...v: unknown[]): string }, n: number) => i18n.t\`\${n} items\`;
(globalThis as Record<string, unknown>).label = label;
`;
    writeFileSync(join(app.root, "src/app.ts"), withForms);
    try {
      await app.run();
      const fr = bundleOf(join(app.root, "dist/fr"));
      expect(fr).toContain("Intl.PluralRules");
      expect(fr).toContain("objet");
      expect(fr).not.toMatch(/provideI18n|setLocale|selectordinal|formatMessage|parseMessage|class I18n|MessageSyntaxError/);
    } finally {
      app.remove();
    }
  });

  it("fails the build for a missing translation by default, naming it",{ timeout: 90_000 }, async () => {
    const app = i18nApp({}, { fr: { [messageId("Welcome", "page title")]: "Bienvenue" }, de: {} });
    try {
      await expect(app.run()).rejects.toThrow(/no translation for "Hello \{0\}, you have \{1\} messages".*src\/app\.ts/s);
    } finally {
      app.remove();
    }
  });

  it("warns or falls back to the source text when asked", { timeout: 90_000 }, async () => {
    for (const onMissing of ["warn", "source"] as const) {
      const app = i18nApp({ locales: ["fr"], bake: { onMissing } }, { fr: { [messageId("Welcome", "page title")]: "Bienvenue" } });
      try {
        await app.run();
        const fr = bundleOf(join(app.root, "dist/fr"));
        expect(fr).toContain("Bienvenue");
        expect(fr).toContain("Hello {{ name() }}, you have {{ count() }} messages"); // the source text
      } finally {
        app.remove();
      }
    }
  });

  it("extracts catalogs at the start of a build (new messages untranslated)", { timeout: 90_000 }, async () => {
    const app = i18nApp({ locales: ["fr"], extract: true, bake: { onMissing: "source" } }, { fr: { [messageId("Welcome", "page title")]: "Bienvenue" } });
    try {
      await app.run();
      const en = JSON.parse(readFileSync(join(app.root, "src/locales/messages.en.json"), "utf8"));
      expect(Object.values(en.translations)).toContain("Hello {0}, you have {1} messages");
      const fr = JSON.parse(readFileSync(join(app.root, "src/locales/messages.fr.json"), "utf8"));
      expect(fr.translations[messageId("Welcome", "page title")]).toBe("Bienvenue");
      expect(Object.keys(fr.untranslated)).toHaveLength(3);
    } finally {
      app.remove();
    }
  });
});

describe("dev server", () => {
  it("does not bake: modules keep their markers and the runtime path, and the HMR accept line is still added", { timeout: 60_000 }, async () => {
    const app = i18nApp({ extract: { serve: false } });
    const server = await createServer(app.config);
    try {
      await server.listen();
      const code = (await server.transformRequest("/src/app.ts"))!.code;
      expect(code).toContain('i18n="page title"');
      expect(code).toContain("i18n-title");
      expect(code).not.toContain("__gableComputed");
      expect(code).toMatch(/import\.meta\.hot\.accept/);
      expect(existsSync(join(app.root, "dist"))).toBe(false);
    } finally {
      await server.close();
      app.remove();
    }
  });
});
