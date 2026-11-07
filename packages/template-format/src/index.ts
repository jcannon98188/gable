import { VOID } from "@gable/core/tooling";
import { parseTemplate, type Item } from "./parse.js";
import { findHtmlLiterals, type TemplateLiteralSpan } from "./scan.js";

export { runCli, type CliIo } from "./cli.js";
export { findHtmlLiterals, type TemplateLiteralSpan } from "./scan.js";
/** The lossless, position-carrying parse of a template body (the Designer's position authority). Offsets are into the exact string given. */
export { parseTemplate as parseTemplateTree, type AttrInfo, type Item as TemplateItem, type Span } from "./parse.js";

export interface FormatOptions {
  /** Spaces per indent level (and the width of a tab). Default 2. */
  indentSize?: number;
  useTabs?: boolean;
  /** Default 80. */
  printWidth?: number;
  /** Prefix added to every output line (first physical line of multi-line raw content only). Default "". */
  baseIndent?: string;
}

export interface LiteralFormatOptions extends Omit<FormatOptions, "baseIndent"> {
  /** Tag of the template literals to format. Default "html". */
  tag?: string;
}

const INLINE = new Set(
  "a abbr b bdi bdo big button cite code data del dfn em font i img input ins kbd label mark meter output progress q s samp select small span strike strong sub sup time tt u var".split(
    " ",
  ),
);

type Ctx = { unit: string; indentSize: number };

/** Formats a template body. Pure, deterministic and idempotent; no gable-specific options. */
export function formatTemplate(source: string, options: FormatOptions = {}): string {
  const indentSize = options.indentSize ?? 2;
  const printWidth = options.printWidth ?? 80;
  const base = options.baseIndent ?? "";
  const ctx: Ctx = { unit: options.useTabs ? "\t" : " ".repeat(indentSize), indentSize };
  const baseCols = [...base].reduce((n, c) => n + (c === "\t" ? indentSize : 1), 0);
  const lines = printItems(parseTemplate(source), Math.max(printWidth - baseCols, 1), ctx);
  return lines.map((l) => (l === "" ? l : base + l)).join("\n");
}

/** The text a template literal's body should have (between the backticks), as the formatter prints it. `span` comes from `findHtmlLiterals(source)`. */
export function formatTemplateLiteral(source: string, span: TemplateLiteralSpan, options: LiteralFormatOptions = {}): string {
  const indentSize = options.indentSize ?? 2;
  const unit = options.useTabs ? "\t" : " ".repeat(indentSize);
  const body = source.slice(span.open, span.close);
  const lineStart = source.lastIndexOf("\n", span.tagStart - 1) + 1;
  const lineIndent = /^[ \t]*/.exec(source.slice(lineStart, span.tagStart))![0];
  const flat = formatTemplate(body, { ...options, printWidth: Infinity });
  if (flat === "") return "";
  if (!body.includes("\n") && !flat.includes("\n")) return flat;
  return "\n" + formatTemplate(body, { ...options, baseIndent: lineIndent + unit }) + "\n" + lineIndent;
}

/** Rewrites only the `html` template literals in a TS/JS source; every other byte is untouched. */
export function formatTemplateLiterals(source: string, options: LiteralFormatOptions = {}): string {
  const tag = options.tag ?? "html";
  let out = "";
  let at = 0;
  for (const lit of findHtmlLiterals(source, tag)) {
    out += source.slice(at, lit.open) + formatTemplateLiteral(source, lit, options);
    at = lit.close;
  }
  return out + source.slice(at);
}

// ---------------------------------------------------------------------------------------------

const indentLines = (lines: string[], ctx: Ctx) => lines.map((l) => (l === "" ? l : ctx.unit + l));

function openTag(el: Extract<Item, { k: "el" }>): string {
  const close = el.selfClose ? " />" : ">";
  return `<${el.name}${el.attrs.map((a) => " " + a).join("")}${close}`;
}

function isFlat(it: Item): boolean {
  if (it.k === "word") return true;
  if (it.k !== "el") return false;
  return it.closed && it.raw === null && INLINE.has(it.name.toLowerCase()) && it.items.every(isFlat);
}

/** Single-line text of a flat item. */
function flatText(it: Item): string {
  if (it.k === "word") return it.text;
  if (it.k !== "el") return "";
  const lname = it.name.toLowerCase();
  const open = openTag(it);
  if (it.selfClose || VOID.has(lname)) return open;
  let inner = "";
  it.items.forEach((c, n) => {
    const sp = c.k === "word" || c.k === "el" ? c.space : false;
    if (sp) inner += " ";
    inner += flatText(c);
  });
  if (it.endSpace && it.items.length) inner += " ";
  return `${open}${inner}</${it.name}>`;
}

/** An item that can live inside a filled run of inline content. */
function isAtom(it: Item, width: number): boolean {
  if (it.k === "word") return true;
  return it.k === "el" && isFlat(it) && openTag(it).length <= width;
}

function printItems(items: Item[], width: number, ctx: Ctx): string[] {
  const out: string[] = [];
  let n = 0;
  const gap = (blank: boolean) => {
    if (out.length && blank) out.push("");
  };
  while (n < items.length) {
    const it = items[n]!;
    if (isAtom(it, width)) {
      let m = n + 1;
      while (m < items.length && isAtom(items[m]!, width) && !items[m]!.blank) m++;
      gap(it.blank);
      out.push(...fill(items.slice(n, m), width));
      n = m;
      continue;
    }
    gap(it.blank);
    out.push(...printBlock(it, width, ctx));
    n++;
  }
  return out;
}

/** Fills atoms to the width; atoms with no preceding whitespace stay glued to their predecessor. */
function fill(atoms: Item[], width: number): string[] {
  const groups: string[] = [];
  atoms.forEach((a, n) => {
    const t = flatText(a);
    const sp = a.k === "word" || a.k === "el" ? a.space : true;
    if (n > 0 && !sp) groups[groups.length - 1] += t;
    else groups.push(t);
  });
  const lines: string[] = [];
  let cur = "";
  for (const g of groups) {
    if (cur === "") cur = g;
    else if (cur.length + 1 + g.length <= width) cur += " " + g;
    else {
      lines.push(cur);
      cur = g;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

function printBlock(it: Item, width: number, ctx: Ctx): string[] {
  switch (it.k) {
    case "word":
      return [it.text];
    case "comment":
      return [it.text];
    case "let":
      return [it.text];
    case "chain": {
      const lines: string[] = [];
      it.parts.forEach((p, n) => {
        const head = n === 0 ? p.head : "} " + p.head;
        lines.push(head, ...indentLines(printItems(p.items, width - ctx.indentSize, ctx), ctx));
      });
      lines.push("}");
      return lines;
    }
    case "el":
      return printElement(it, width, ctx);
  }
}

function printElement(el: Extract<Item, { k: "el" }>, width: number, ctx: Ctx): string[] {
  const lname = el.name.toLowerCase();
  const single = openTag(el);
  let head: string[];
  if (single.length <= width) head = [single];
  else {
    head = [`<${el.name}`, ...indentLines(el.attrs, ctx), el.selfClose ? "/>" : ">"];
  }
  const closeTag = el.closed ? `</${el.name}>` : "";
  if (el.selfClose || (VOID.has(lname) && el.items.length === 0 && el.raw === null)) return head;
  if (el.raw !== null) {
    const last = head.length - 1;
    head[last] = head[last]! + el.raw + closeTag;
    return head;
  }
  if (el.items.length === 0) {
    const last = head.length - 1;
    head[last] = head[last]! + closeTag;
    return head;
  }
  if (el.items.every(isFlat) && head.length === 1) {
    const joined = el.items.reduce((acc, c, n) => acc + (n > 0 && (c.k === "word" || c.k === "el") && c.space ? " " : "") + flatText(c), "");
    if (single.length + joined.length + closeTag.length <= width) return [single + joined + closeTag];
  }
  const inner = printItems(el.items, width - ctx.indentSize, ctx);
  return [...head, ...indentLines(inner, ctx), ...(closeTag ? [closeTag] : [])];
}
