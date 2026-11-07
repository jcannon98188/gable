// Reads the translation catalogs named by the `i18n` plugin option, for the `i18n-missing-translation` rule.
// Catalogs are cached by file and modification time, so an editor session re-reads one only after it changed.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fromXliff, readCatalog } from "@gable/core/tooling";
import type { I18nCheckConfig } from "./config.js";

const cache = new Map<string, { mtime: number; ids: Set<string> | null }>();

/** The ids that have a translation in `locale`'s catalog, or `null` when the file is missing or unreadable. */
export function translatedIds(config: I18nCheckConfig, locale: string): Set<string> | null {
  const file = path.resolve(config.root, config.catalogs.replace(/\{locale\}/g, locale));
  if (!existsSync(file)) return null;
  const mtime = statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.ids;
  let ids: Set<string> | null;
  try {
    const text = readFileSync(file, "utf8");
    const messages = /\.(?:xlf|xliff)$/i.test(file) ? fromXliff(text).messages : readCatalog(JSON.parse(text) as Record<string, unknown>).messages;
    ids = new Set(Object.keys(messages));
  } catch {
    ids = null;
  }
  cache.set(file, { mtime, ids });
  return ids;
}
