// The template outline the Structure tab shows: one row per element, control-flow block and interpolated text of a
// component's template, from the same lossless parser the edits use, so a row's `start` is the handle the agent maps back
// to a rendered node (`nodeAt`). Blocks are read-only here: what they render is decided at runtime.
import type { TemplateItem } from "@gable/template-format";

export interface OutlineRow {
  /** Offset of the element's `<` in the template body (the agent's handle); for blocks and text, where they start. */
  start: number;
  depth: number;
  kind: "element" | "block" | "text";
  /** `li.todo#main`, `@if (editing())`, `{{ title }}`. */
  label: string;
  /** Elements only. */
  tag: string;
  /** A short note: `3 bindings`, `checkbox`, `@else`. */
  detail: string;
  /** Blocks: their branches are chosen at runtime, so they cannot be selected or edited from here. */
  readOnly: boolean;
  /** Interpolations in the element's own text, shown as chips (`{{ title }}`). */
  interpolations: string[];
  /** Inside a block: the element may not be rendered right now. */
  conditional: boolean;
}

const INTERPOLATION = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const BINDING = /^(\[|\(|\*|@|#)/;

function attrValue(body: string, el: Extract<TemplateItem, { k: "el" }>, name: string): string | null {
  const a = el.attrInfo.find((x) => x.name === name);
  return a && a.valueStart >= 0 ? body.slice(a.valueStart, a.valueEnd) : null;
}

function elementLabel(body: string, el: Extract<TemplateItem, { k: "el" }>): string {
  const cls = attrValue(body, el, "class");
  const id = attrValue(body, el, "id");
  const classes = cls && !cls.includes("{{") ? cls.split(/\s+/).filter(Boolean).slice(0, 2) : [];
  return el.name + classes.map((c) => "." + c).join("") + (id && !id.includes("{{") ? "#" + id : "");
}

function elementDetail(body: string, el: Extract<TemplateItem, { k: "el" }>): string {
  const bindings = el.attrInfo.filter((a) => BINDING.test(a.name) || body.slice(a.start, a.end).includes("{{")).length;
  if (bindings) return `${bindings} binding${bindings === 1 ? "" : "s"}`;
  if (el.name.toLowerCase() === "input") return attrValue(body, el, "type") ?? "text";
  return "";
}

/** The outline of one template body, in document order. */
export function templateOutline(body: string, tree: TemplateItem[]): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (items: TemplateItem[], depth: number, conditional: boolean) => {
    for (const it of items) {
      if (it.k === "el") {
        const own = it.raw !== null ? [] : it.items.filter((c) => c.k === "word").flatMap((w) => [...body.slice(w.start, w.end).matchAll(INTERPOLATION)].map((m) => `{{ ${m[1]} }}`));
        rows.push({ start: it.start, depth, kind: "element", label: elementLabel(body, it), tag: it.name, detail: elementDetail(body, it), readOnly: false, interpolations: [...new Set(own)], conditional });
        if (it.raw === null) walk(it.items, depth + 1, conditional);
      } else if (it.k === "chain") {
        it.parts.forEach((p, i) => {
          const head = p.head.replace(/\s*\{$/, "").trim();
          rows.push({ start: p.headStart, depth, kind: "block", label: head, tag: "", detail: i === 0 ? "read-only" : "", readOnly: true, interpolations: [], conditional });
          walk(p.items, depth + 1, true);
        });
      } else if (it.k === "word" && depth === 0) {
        // text at the root of the template (elements' text is shown as chips on the element)
        const found = [...body.slice(it.start, it.end).matchAll(INTERPOLATION)].map((m) => `{{ ${m[1]} }}`);
        for (const f of found) rows.push({ start: it.start, depth, kind: "text", label: f, tag: "", detail: "", readOnly: true, interpolations: [], conditional });
      }
    }
  };
  walk(tree, 0, false);
  return rows;
}
