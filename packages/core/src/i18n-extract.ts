// Message extraction from a template source string, for build tooling (`@gable/core/tooling`).
// It uses the runtime's own template parser, so the ids it finds are the ids the runtime looks up.
import { parseTemplate, type TemplateNode } from "./template.js";
import type { ExtractedMessage } from "./i18n-message.js";

/**
 * Every message in one template: the text of each `i18n` element and each `i18n-<attr>` attribute, in document order.
 * `file` (when given) is used for `location`, as `file:line`, with line numbers relative to the template string
 * plus `firstLine - 1`. Throws what the template parser throws (a syntax error, or marker misuse).
 */
export function extractTemplateMessages(source: string, options: { file?: string; firstLine?: number } = {}): ExtractedMessage[] {
  const strings = Object.assign([source], { raw: [source] }) as unknown as TemplateStringsArray;
  const tree = parseTemplate({ strings, values: [] });
  const out: ExtractedMessage[] = [];
  const lineAt = (offset: number | undefined) => {
    if (offset === undefined || !options.file) return undefined;
    return `${options.file}:${(options.firstLine ?? 1) + source.slice(0, offset).split("\n").length - 1}`;
  };
  const walk = (nodes: readonly TemplateNode[], line?: string) => {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          if (node.i18n) out.push({ ...node.i18n, ...(line ? { location: line } : {}) });
          break;
        case "element": {
          const here = lineAt(node.pos?.start) ?? line;
          for (const a of node.i18nAttrs ?? []) out.push({ ...a.i18n, ...(here ? { location: here } : {}) });
          walk(node.children, here);
          break;
        }
        case "if":
          for (const b of node.branches) walk(b.children, line);
          break;
        case "for":
          walk(node.children, line);
          if (node.empty) walk(node.empty, line);
          break;
        case "switch":
          for (const c of node.cases) walk(c.children, line);
          break;
        case "defer":
          for (const s of [node.children, node.placeholder, node.loading, node.error]) if (s) walk(s, line);
          break;
      }
    }
  };
  walk(tree);
  return out;
}
