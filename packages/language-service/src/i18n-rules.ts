// i18n marker lint rules for templates. They look at the scanned template tree only (no types, no catalogs).
// Each rule reports through `report(start, length, rule, message)` like the a11y rules.

import { parseMarker } from "@gable/core/tooling";
import type { Report } from "./a11y-rules.js";
import type { TemplateModel } from "./emit.js";
import type { ElementNode, TNode } from "./scan.js";

/** The `i18n` marker rules: `i18n-attr-missing`, `i18n-empty`, `i18n-not-translatable`, `i18n-marker-syntax`. */
export function i18nRules(model: TemplateModel, report: Report): void {
  const visit = (nodes: TNode[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "element":
          element(node, report);
          visit(node.children);
          break;
        case "if":
          for (const b of node.branches) visit(b.children);
          break;
        case "switch":
          for (const c of node.cases) visit(c.children);
          break;
        case "for":
          visit(node.children);
          if (node.empty) visit(node.empty);
          break;
        case "defer":
          for (const s of [node.children, node.placeholder, node.loading, node.error]) if (s) visit(s);
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
    if (!attr.name.startsWith("i18n-") || attr.name.length === 5) continue;
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
