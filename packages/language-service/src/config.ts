import path from "node:path";
import ts from "@typescript/typescript6";

export type Severity = "off" | "warn" | "error";

/** The rule catalogue. Correctness rules default to error; advisory rules (later tickets) to warn. */
export const RULES = {
  "template-syntax": "error",
  "expression-syntax": "error",
  "unknown-member": "error",
  "type-mismatch": "error",
  "bare-signal": "error",
  "call-non-signal": "error",
  "call-observable": "error",
  "model-not-writable": "error",
  "model-type-mismatch": "error",
  "unknown-event": "error",
  "lazy-outside-defer": "error",
  "constructor-in-class": "error",
  "inject-host-context": "error",
  "module-level-state": "warn",
  "class-fragment": "warn",
  "class-fields-config": "error",
  "router-link-import": "error",
  "router-link-type": "error",
  "field-not-a-field": "error",
  "field-value-mismatch": "error",
  "model-key-state": "error",
  "rows-track-key": "warn",
  "custom-control-members": "error",
  "component-meta": "error",
  "store-write-outside-patch": "error",
  "store-method-in-template": "error",
  "store-outside-injection-context": "error",
  "a11y-img-alt": "warn",
  "a11y-control-name": "warn",
  "a11y-aria-valid": "warn",
  "a11y-click-key": "warn",
  "a11y-tabindex-positive": "warn",
  "a11y-heading-order": "warn",
  "a11y-autofocus": "warn",
  "i18n-attr-missing": "error",
  "i18n-not-translatable": "error",
  "i18n-marker-syntax": "error",
  "i18n-empty": "warn",
  "i18n-missing-translation": "warn",
  "i18n-unmarked-text": "off",
} as const satisfies Record<string, Severity>;

export type RuleId = keyof typeof RULES;

/** The `i18n` plugin option: where the translation catalogs are. Same shape as the options of `gableI18n` in `@gable/vite`. */
export interface I18nCheckConfig {
  /** The language the templates are written in; it needs no catalog. Default `"en"`. */
  sourceLocale: string;
  /** The target locales whose catalogs are checked. */
  locales: string[];
  /** Catalog path template, relative to the tsconfig's folder. `{locale}` is replaced; `.xlf` selects XLIFF. Default `src/locales/messages.{locale}.json`. */
  catalogs: string;
  /** Folder the catalog paths are relative to (the tsconfig's folder). */
  root: string;
}

export interface AnalyzerConfig {
  /** Tag of tagged template literals that hold Gable templates. */
  templateTag: string;
  severity: Record<RuleId, Severity>;
  /** Set when the plugin entry has an `i18n` section; `i18n-missing-translation` does nothing without it. */
  i18n?: I18nCheckConfig;
}

export const PLUGIN_NAME = "@gable/language-service";

/** Reads the plugin entry of a tsconfig's `compilerOptions.plugins`. Problems come back as `errors`. */
export function readConfig(options: ts.CompilerOptions): { config: AnalyzerConfig; errors: string[] } {
  const errors: string[] = [];
  const entry = ((options.plugins as ts.PluginImport[] | undefined) ?? []).find((p) => p.name === PLUGIN_NAME) as Record<string, unknown> | undefined;
  const config: AnalyzerConfig = { templateTag: "html", severity: { ...RULES } };
  if (!entry) return { config, errors };
  if (entry.templateTag !== undefined) {
    if (typeof entry.templateTag === "string" && /^[A-Za-z_$][\w$]*$/.test(entry.templateTag)) config.templateTag = entry.templateTag;
    else errors.push(`plugin option "templateTag" must be an identifier, got ${JSON.stringify(entry.templateTag)}`);
  }
  if (entry.i18n !== undefined) {
    const i18n = entry.i18n as Record<string, unknown> | null;
    const root = path.dirname((options.configFilePath as string | undefined) ?? "tsconfig.json");
    if (typeof i18n !== "object" || i18n === null || Array.isArray(i18n)) errors.push(`plugin option "i18n" must be an object`);
    else {
      const problems = errors.length;
      const sourceLocale = i18n.sourceLocale ?? "en";
      if (typeof sourceLocale !== "string" || sourceLocale === "") errors.push(`plugin option "i18n.sourceLocale" must be a locale string, got ${JSON.stringify(i18n.sourceLocale)}`);
      const locales = i18n.locales;
      if (!Array.isArray(locales) || locales.some((l) => typeof l !== "string" || l === "")) errors.push(`plugin option "i18n.locales" must be an array of locale strings`);
      const catalogs = i18n.catalogs ?? "src/locales/messages.{locale}.json";
      if (typeof catalogs !== "string" || !catalogs.includes("{locale}")) errors.push(`plugin option "i18n.catalogs" must be a path template containing {locale}, got ${JSON.stringify(i18n.catalogs)}`);
      for (const key of Object.keys(i18n)) {
        if (!["sourceLocale", "locales", "catalogs", "xliff", "extract", "bake"].includes(key)) errors.push(`unknown option "i18n.${key}" (known: sourceLocale, locales, catalogs)`);
      }
      if (errors.length === problems) config.i18n = { sourceLocale: sourceLocale as string, locales: (locales as string[]).filter((l) => l !== sourceLocale), catalogs: catalogs as string, root };
    }
  }
  const rules = entry.rules;
  if (rules !== undefined) {
    if (typeof rules !== "object" || rules === null || Array.isArray(rules)) errors.push(`plugin option "rules" must be an object`);
    else {
      for (const [name, value] of Object.entries(rules)) {
        if (!(name in RULES)) errors.push(`unknown rule "${name}" in plugin option "rules" (known rules: ${Object.keys(RULES).join(", ")})`);
        else if (value !== "off" && value !== "warn" && value !== "error") {
          errors.push(`rule "${name}" has severity ${JSON.stringify(value)}; use "off", "warn" or "error"`);
        } else config.severity[name as RuleId] = value;
      }
    }
  }
  return { config, errors };
}
