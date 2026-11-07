// i18n marker lint rules for templates. They look at the scanned template tree only (no types, no catalogs).
// Each rule reports through `report(start, length, rule, message)` like the a11y rules.

import { messageFromParts, messageId, parseMarker } from "@gable/core/tooling";
import type { Report } from "./a11y-rules.js";
import type { AnalyzerConfig } from "./config.js";
import { translatedIds } from "./i18n-catalogs.js";
import type { TemplateModel } from "./emit.js";
import type { ElementNode, TNode, TextNode } from "./scan.js";

/** Attributes whose static value is read by people; `i18n-unmarked-text` expects `i18n-<name>` next to them. */
const USER_FACING_ATTRS = ["title", "placeholder", "alt", "aria-label"];

/**
 * The `i18n` rules: the marker rules (`i18n-attr-missing`, `i18n-empty`, `i18n-not-translatable`, `i18n-marker-syntax`),
 * `i18n-missing-translation` (when the config has an `i18n` section) and the opt-in `i18n-unmarked-text`.
 */
export function i18nRules(model: TemplateModel, report: Report, config?: Pick<AnalyzerConfig, "i18n" | "severity">): void {
  const checkCatalogs = config?.i18n !== undefined && config.severity["i18n-missing-translation"] !== "off";
  const checkUnmarked = config !== undefined && config.severity["i18n-unmarked-text"] !== "off";
  const catalogs = checkCatalogs
    ? config.i18n!.locales.map((locale) => ({ locale, ids: translatedIds(config.i18n!, locale) }))
    : [];
  const visit = (nodes: TNode[], ignored = false): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "element": {
          element(node, report);
          if (checkCatalogs) missingTranslations(node, catalogs, report);
          const skip = ignored || node.attrs.some((a) => a.name === "i18n-ignore");
          if (checkUnmarked && !skip) unmarkedAttrs(node, report);
          visit(node.children, skip || node.attrs.some((a) => a.name === "i18n") || (checkUnmarked && IGNORED_TAGS.has(node.tag)));
          break;
        }
        case "text":
          if (checkUnmarked && !ignored) unmarkedText(node, report);
          break;
        case "if":
          for (const b of node.branches) visit(b.children, ignored);
          break;
        case "switch":
          for (const c of node.cases) visit(c.children, ignored);
          break;
        case "for":
          visit(node.children, ignored);
          if (node.empty) visit(node.empty, ignored);
          break;
        case "defer":
          for (const s of [node.children, node.placeholder, node.loading, node.error]) if (s) visit(s, ignored);
          break;
      }
    }
  };
  visit(model.tree);
}

function marker(value: string | undefined, at: number, length: number, report: Report): void {
  try {
    parseMarker(value ?? "");
  } catch (error) {
    report(at, length, "i18n-marker-syntax", (error as Error).message);
  }
}

function element(el: ElementNode, report: Report): void {
  const own = el.attrs.find((a) => a.name === "i18n");
  if (own) {
    marker(own.value, own.nameStart, 4, report);
    const where = (message: string, rule: "i18n-empty" | "i18n-not-translatable") => report(own.nameStart, 4, rule, message);
    const [first] = el.children;
    if (el.children.length === 0) {
      where(`<${el.tag} i18n> has no text to translate: i18n marks the element's text. Use i18n-<attribute> to translate an attribute`, "i18n-empty");
    } else if (el.children.length > 1 || first!.type !== "text") {
      where(`<${el.tag} i18n> may only contain text and {{ }} interpolations: put i18n on the inner elements instead`, "i18n-not-translatable");
    } else if (!first!.hasText) {
      where(`<${el.tag} i18n> contains only an interpolation: there is no text for translators; translate the surrounding text, or remove i18n`, "i18n-empty");
    }
  }
  for (const attr of el.attrs) {
    if (!attr.name.startsWith("i18n-") || attr.name.length === 5 || attr.name === "i18n-ignore") continue;
    const target = attr.name.slice(5);
    marker(attr.value, attr.nameStart, attr.name.length, report);
    const present = el.attrs.some((a) => a.name === target && a.value !== undefined && a.value !== "");
    if (present) continue;
    const bound = el.expressions.some((x) => (x.kind === "value" || x.kind === "model") && x.name.replace(/^attr\./, "") === target);
    if (bound) {
      report(attr.nameStart, attr.name.length, "i18n-not-translatable", `${attr.name} cannot translate the binding [${target}]: only static text is translated. Translate the source of the value (an i18n\`\` tag) instead`);
    } else {
      report(attr.nameStart, attr.name.length, "i18n-attr-missing", `${attr.name} has no ${target}="..." attribute on <${el.tag}> to translate`);
    }
  }
}

/** Elements whose text is code or markup, not prose for translators. */
const IGNORED_TAGS = new Set(["script", "style", "code", "pre", "kbd", "samp"]);

const INTERPOLATION = /\{\{[\s\S]*?\}\}/g;

/** Text with letters in it. Whitespace, numbers, punctuation and `{{ }}` alone are not worth translating. */
const hasWords = (text: string) => /\p{L}/u.test(text);

function unmarkedText(node: TextNode, report: Report): void {
  const stripped = node.raw.replace(INTERPOLATION, " ");
  if (!hasWords(stripped)) return;
  const lead = node.raw.length - node.raw.trimStart().length;
  report(node.start + lead, node.raw.trim().length, "i18n-unmarked-text", `Text "${shorten(stripped)}" is not marked for translation: add i18n to its element (i18n="description"), or i18n-ignore to leave it as it is`);
}

function unmarkedAttrs(el: ElementNode, report: Report): void {
  for (const attr of el.attrs) {
    if (!USER_FACING_ATTRS.includes(attr.name) || !attr.value || !hasWords(attr.value)) continue;
    if (el.attrs.some((a) => a.name === `i18n-${attr.name}`)) continue;
    report(attr.nameStart, attr.name.length, "i18n-unmarked-text", `${attr.name}="${shorten(attr.value)}" is not marked for translation: add i18n-${attr.name}, or i18n-ignore on the element to leave it as it is`);
  }
}

const shorten = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? flat.slice(0, 37) + "..." : flat;
};

interface CatalogState {
  locale: string;
  /** Ids with a translation, or null when the catalog file is missing or unreadable. */
  ids: Set<string> | null;
}

/** `i18n-missing-translation`: each marked message of the element that some configured locale has no translation for. */
function missingTranslations(el: ElementNode, catalogs: CatalogState[], report: Report): void {
  if (catalogs.length === 0) return;
  const check = (message: string, marker: string | undefined, at: number, length: number) => {
    let parsed;
    try {
      parsed = parseMarker(marker ?? "");
    } catch {
      return; // i18n-marker-syntax reports it
    }
    const id = parsed.id ?? messageId(message, parsed.description);
    const missing = catalogs.filter((c) => !c.ids?.has(id));
    if (missing.length === 0) return;
    const unreadable = missing.filter((c) => c.ids === null).map((c) => c.locale);
    const note = unreadable.length ? ` (no readable catalog for ${unreadable.join(", ")})` : "";
    report(at, length, "i18n-missing-translation", `"${shorten(message)}" (id ${id}) has no translation for ${missing.map((c) => c.locale).join(", ")}${note}`);
  };
  for (const attr of el.attrs) {
    if (!attr.name.startsWith("i18n-") || attr.name === "i18n-ignore" || attr.name.length === 5) continue;
    const target = el.attrs.find((a) => a.name === attr.name.slice(5));
    if (!target?.value) continue; // i18n-attr-missing reports it
    check(messageFromParts([target.value]), attr.value, attr.nameStart, attr.name.length);
  }
  const own = el.attrs.find((a) => a.name === "i18n");
  const [text] = el.children;
  if (own && el.children.length === 1 && text!.type === "text" && text!.hasText) {
    const parts: Array<string | { placeholder: true }> = [];
    text!.raw.split(INTERPOLATION).forEach((piece, i) => {
      if (i > 0) parts.push({ placeholder: true });
      parts.push(piece);
    });
    check(messageFromParts(parts), own.value, own.nameStart, 4);
  }
}
