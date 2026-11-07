import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fromXliff, mergeExtracted, readCatalog, sourceCatalogJson, toXliff, type ExtractedMessage, type Messages } from "@gable/core/tooling";

export const isXliff = (path: string) => /\.(?:xlf|xliff)$/i.test(path);

/** `src/locales/{locale}.json` for `fr`. */
export function catalogPath(root: string, template: string, locale: string): string {
  return resolve(root, template.replace(/\{locale\}/g, locale));
}

/** The translations in a catalog file (JSON in the core format, or XLIFF 1.2). Includes `obsolete` entries separately. */
export function readCatalogFile(path: string): { translations: Messages; obsolete: Messages } {
  const text = readFileSync(path, "utf8");
  if (isXliff(path)) return { translations: fromXliff(text).messages, obsolete: {} };
  const json = JSON.parse(text) as Record<string, unknown>;
  const obsolete = typeof json.obsolete === "object" && json.obsolete !== null ? (json.obsolete as Messages) : {};
  return { translations: readCatalog(json).messages, obsolete };
}

export interface LocaleReport {
  locale: string;
  /** Ids in the source with no translation yet. */
  untranslated: string[];
  /** Ids that had a translation but are no longer in the source. */
  obsolete: string[];
}

export interface WriteOptions {
  root: string;
  sourceLocale: string;
  locales: readonly string[];
  /** Path template for the catalogs (`{locale}` is replaced); a `.xlf` extension selects XLIFF. */
  catalogs: string;
  /** Optional extra XLIFF export for translators, same template rules. */
  xliff?: string;
}

function writeIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
}

/**
 * Writes the source catalog and updates each locale's catalog from the extracted messages.
 *
 * JSON locale catalogs are `{ locale, translations, untranslated?, obsolete? }`: `translations` holds real translations
 * only (so a missing one is detectable), `untranslated` lists new messages with their source text for the translator,
 * and `obsolete` keeps translations whose message left the source (they come back if the message does). XLIFF locale
 * catalogs carry a `target` only for translated units.
 */
export function writeCatalogs(messages: readonly ExtractedMessage[], options: WriteOptions): LocaleReport[] {
  const merged = mergeExtracted(messages);
  const ids = new Set(merged.map((m) => m.id));
  const xliffOut = (locale: string, translations?: Messages) =>
    toXliff(merged, { sourceLocale: options.sourceLocale, targetLocale: locale === options.sourceLocale ? undefined : locale, ...(translations ? { translations } : {}) });

  const sourcePath = catalogPath(options.root, options.catalogs, options.sourceLocale);
  writeIfChanged(sourcePath, isXliff(sourcePath) ? xliffOut(options.sourceLocale) : sourceCatalogJson(merged, options.sourceLocale));
  if (options.xliff) writeIfChanged(catalogPath(options.root, options.xliff, options.sourceLocale), xliffOut(options.sourceLocale));

  const reports: LocaleReport[] = [];
  for (const locale of options.locales) {
    if (locale === options.sourceLocale) continue;
    const path = catalogPath(options.root, options.catalogs, locale);
    const existing = existsSync(path) ? readCatalogFile(path) : { translations: {}, obsolete: {} };
    const pool: Record<string, string> = { ...existing.obsolete, ...existing.translations };
    const translations: Record<string, string> = {};
    const untranslated: Record<string, string> = {};
    const obsolete: Record<string, string> = {};
    for (const m of merged) {
      if (pool[m.id] !== undefined) translations[m.id] = pool[m.id]!;
      else untranslated[m.id] = m.message;
    }
    for (const [id, text] of Object.entries(pool).sort(([a], [b]) => (a < b ? -1 : 1))) if (!ids.has(id)) obsolete[id] = text;

    if (isXliff(path)) writeIfChanged(path, xliffOut(locale, translations));
    else {
      const body: Record<string, unknown> = { locale, translations };
      if (Object.keys(untranslated).length) body.untranslated = untranslated;
      if (Object.keys(obsolete).length) body.obsolete = obsolete;
      writeIfChanged(path, JSON.stringify(body, null, 2) + "\n");
    }
    if (options.xliff) writeIfChanged(catalogPath(options.root, options.xliff, locale), xliffOut(locale, translations));
    reports.push({ locale, untranslated: Object.keys(untranslated), obsolete: Object.keys(obsolete) });
  }
  return reports;
}
