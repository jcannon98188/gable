import { join } from "node:path";
import type { Plugin } from "vite";
import { bakeSource } from "./bake.js";
import { catalogPath, readCatalogFile, writeCatalogs } from "./catalogs.js";
import { extractProject } from "./extract.js";
import { existsSync } from "node:fs";

export type OnMissing = "error" | "warn" | "source";

export interface GableI18nOptions {
  /** The language the templates are written in. Default `"en"`. */
  sourceLocale?: string;
  /** The target locales (the source locale needs no catalog). */
  locales: readonly string[];
  /** Catalog path template, relative to the project root. `{locale}` is replaced; `.xlf` selects XLIFF. Default `src/locales/messages.{locale}.json`. */
  catalogs?: string;
  /** Also write an XLIFF export for translators: a path template like `catalogs`. */
  xliff?: string;
  /**
   * Extraction: scan `dirs` and write the source catalog and update every locale catalog (new messages are listed as
   * untranslated, removed ones as obsolete). Runs at the start of a build. `serve: true` also runs it when the dev
   * server starts. `false` turns it off. Default: on in builds.
   */
  extract?: boolean | { dirs?: readonly string[]; serve?: boolean };
  /**
   * Baked builds: `vite build` emits one output per locale, `<outDir>/<locale>/`, with the translations compiled into
   * the templates and no i18n runtime. Dev is never baked. Default `false`.
   *
   * `onMissing` decides what a locale without a translation does: `"error"` (default) fails the build listing every
   * missing message, `"warn"` warns and uses the source text, `"source"` silently uses the source text.
   * `stripRuntime` (default `true`) also replaces core's marker renderer (the I18n service and the ICU formatter)
   * with a stub, since no markers are left to render; set it to `false` if a dependency ships unbaked markers.
   */
  bake?: boolean | { onMissing?: OnMissing; stripRuntime?: boolean };
}

const PREFIX = "i18n_";
/** Environment names allow only letters, digits, `$` and `_`, so `zh-Hant` becomes `i18n_zh_Hant`. */
const envName = (locale: string) => PREFIX + locale.replace(/[^\w$]/g, "_");

/** Replaces core's i18n-view module in baked builds: no markers remain, so nothing calls it. */
const STUB = [
  'const unbaked = () => { throw new Error("[gable] an i18n marker reached a baked build: it was not in a source file the plugin bakes"); };',
  "export const buildI18nText = unbaked;",
  "export const bindI18nAttrs = unbaked;",
].join("\n");

/**
 * The Gable i18n plugin: extraction of messages to catalogs, and baked per-locale builds. Use it next to `gable()`:
 * `plugins: [gable(), gableI18n({ locales: ["fr", "de"], bake: true })]`. In `vite` (serve) it never transforms
 * code, so HMR and the runtime i18n path are untouched.
 */
export function gableI18n(options: GableI18nOptions): Plugin {
  const sourceLocale = options.sourceLocale ?? "en";
  const catalogs = options.catalogs ?? "src/locales/messages.{locale}.json";
  const bake = options.bake === true ? {} : options.bake || undefined;
  const stripRuntime = !(bake && bake.stripRuntime === false);
  const onMissing: OnMissing = (bake && bake.onMissing) ?? "error";
  const extract = options.extract === false ? undefined : options.extract === true || options.extract === undefined ? {} : options.extract;
  const dirs = extract && "dirs" in extract && extract.dirs ? extract.dirs : ["src"];
  const bakedLocales = [sourceLocale, ...options.locales.filter((l) => l !== sourceLocale)];
  let root = process.cwd();
  let outDir = "dist";
  let logger: { info(m: string): void; warn(m: string): void } = console as never;
  const translations = new Map<string, Record<string, string>>();
  const reported = new Set<string>();
  const problems: string[] = [];

  const runExtract = () => {
    const messages = extractProject(root, dirs);
    const reports = writeCatalogs(messages, { root, sourceLocale, locales: options.locales, catalogs, ...(options.xliff ? { xliff: options.xliff } : {}) });
    logger.info(`[gable-i18n] extracted ${new Set(messages.map((m) => m.id)).size} message(s) from ${dirs.join(", ")}`);
    for (const r of reports) {
      if (r.untranslated.length) logger.warn(`[gable-i18n] ${r.locale}: ${r.untranslated.length} untranslated message(s)`);
      if (r.obsolete.length) logger.info(`[gable-i18n] ${r.locale}: ${r.obsolete.length} obsolete translation(s)`);
    }
  };

  const catalogFor = (locale: string): Record<string, string> => {
    let cat = translations.get(locale);
    if (cat) return cat;
    const path = catalogPath(root, catalogs, locale);
    if (!existsSync(path)) throw new Error(`[gable-i18n] no catalog for locale "${locale}": expected ${path}`);
    cat = { ...readCatalogFile(path).translations };
    translations.set(locale, cat);
    return cat;
  };

  return {
    name: "gable-i18n",
    enforce: "pre",
    config(user, { command }) {
      outDir = user.build?.outDir ?? "dist";
      if (command !== "build" || !bake) return;
      const environments: Record<string, { consumer: "client"; build: { outDir: string; emptyOutDir: boolean } }> = {};
      for (const locale of bakedLocales) environments[envName(locale)] = { consumer: "client", build: { outDir: join(outDir, locale), emptyOutDir: true } };
      return {
        environments,
        builder: {
          async buildApp(builder) {
            for (const env of Object.values(builder.environments)) if (env.name.startsWith(PREFIX)) await builder.build(env);
          },
        },
      };
    },
    configResolved(config) {
      root = config.root;
      logger = config.logger;
    },
    buildStart() {
      // Once per build, from the first environment to start.
      if (extract && this.environment.mode === "build" && (!bake || this.environment.name === envName(bakedLocales[0]!))) runExtract();
    },
    configureServer() {
      if (extract && typeof extract === "object" && extract.serve) runExtract();
    },
    load(id) {
      if (!bake || !stripRuntime || this.environment.mode !== "build" || !this.environment.name.startsWith(PREFIX)) return;
      if (!/[\\/]core[\\/](?:src|dist)[\\/]i18n-view\.[jt]s$/.test(id.split("?")[0]!)) return;
      return STUB;
    },
    transform: {
      handler(code, id) {
        if (!bake || this.environment.mode !== "build" || !this.environment.name.startsWith(PREFIX)) return;
        const file = id.split("?")[0]!;
        if (file.includes("\0") || file.includes("/node_modules/") || !/\.(?:[mc]?[jt]s|[jt]sx)$/.test(file) || !code.includes("i18n")) return;
        const locale = bakedLocales.find((l) => envName(l) === this.environment.name)!;
        const rel = file.startsWith(root) ? file.slice(root.length + 1) : file;
        const target = locale === sourceLocale ? undefined : catalogFor(locale);
        const result = bakeSource(code, rel, {
          translate: (msgId) => (target ? target[msgId] : undefined),
          missing: (info) => {
            if (!target || onMissing === "source") return;
            const message = `[gable-i18n] ${locale}: no translation for "${info.message}" (id ${info.id}) at ${info.location}`;
            if (onMissing === "warn") {
              if (!reported.has(locale + info.id)) {
                reported.add(locale + info.id);
                this.warn(message);
              }
            } else problems.push(message);
          },
        });
        if (result.count === 0) return;
        return { code: result.code, map: null };
      },
    },
    buildEnd() {
      if (problems.length) this.error(problems.join("\n"));
    },
  };
}
