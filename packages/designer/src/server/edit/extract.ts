// Extract component: moves an element of a template into a new component in a file beside it and uses the component in its
// place. Positions come from @gable/template-format's parser, like every template edit. Only static markup moves: a binding,
// event, reference, block or interpolation reads the old component's state, and carrying that over would mean writing code
// (inputs, outputs), so such a selection is refused with the reason. The new file is written formatter-clean; the source gets
// a minimal patch (the element replaced, the class imported and listed in `imports`), and both are one undo step.
import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { findHtmlLiterals, formatTemplate, formatTemplateLiteral, parseTemplateTree, type TemplateItem, type TemplateLiteralSpan } from "@gable/template-format";
import type { Hunk } from "./hunks.js";
import { ensureImport, ensureMetaImport, metaAround } from "./meta.js";
import { applyPlan, elementsOf, fail, findTarget, type El, type Entry, type FormatOptions } from "./template.js";
import type { ComponentRef, EditError, EditOp, ExtractCheck, PaletteEntry } from "./types.js";

type ExtractOp = Extract<EditOp, { op: "extract" }>;

export interface ExtractCtx {
  /** The source file (absolute) and its project-relative path. */
  abs: string;
  rel: string;
  /** The source file's text, LF. */
  text: string;
  lit: TemplateLiteralSpan;
  fo: FormatOptions;
  /** The project's components, to import the ones the extracted markup uses. */
  palette: () => PaletteEntry[];
}

export interface ExtractPlan {
  /** Hunks of the source file, LF coordinates. */
  hunks: Hunk[];
  label: string;
  select: { raw: string; offset: number } | null;
  created: { abs: string; text: string };
  note?: string;
}

const STATIC_ATTR = /^[A-Za-z_:][\w:.-]*$/;

/** What in an element's subtree reads the component's state, or null when it is static markup. */
function dynamicPart(el: El): string | null {
  for (const a of el.attrInfo) {
    if (a.name === "i18n" || a.name.startsWith("i18n-")) return `<${el.name}> is translatable (${a.name})`;
    if (!STATIC_ATTR.test(a.name)) {
      const kind = a.name.startsWith("(") ? "an event handler" : a.name.startsWith("#") ? "a template reference" : "a binding";
      return `<${el.name}> has ${a.name} (${kind})`;
    }
    if (a.text.includes("{{")) return `<${el.name} ${a.name}> holds an interpolation`;
  }
  const items = (list: TemplateItem[]): string | null => {
    for (const it of list) {
      if (it.k === "el") {
        const d = dynamicPart(it);
        if (d) return d;
      } else if (it.k === "word" && it.text.includes("{{")) return `<${el.name}> shows ${it.text.trim()}`;
      else if (it.k === "chain") return `<${el.name}> holds a ${it.parts[0]!.head.replace(/\s*\(.*$|\s*\{$/, "")} block`;
      else if (it.k === "let") return `<${el.name}> declares ${it.text.trim()}`;
    }
    return null;
  };
  return items(el.items);
}

const normalized = (body: string, el: El) => body.slice(el.start, el.end).replace(/\n[ \t]*/g, "\n");

/** The elements of the template written exactly like `entry`'s (whitespace at line starts aside), itself included. */
function copiesOf(body: string, entries: Entry[], entry: Entry): Entry[] {
  const want = normalized(body, entry.el);
  const out: Entry[] = [];
  for (const e of entries) {
    // Nested copies cannot both be replaced; the outer one wins.
    if (out.some((o) => e.el.start >= o.el.start && e.el.end <= o.el.end)) continue;
    if (e.el.name === entry.el.name && normalized(body, e.el) === want) out.push(e);
  }
  return out;
}

/** Whether an element can be extracted, for the Inspector and the dialog (shown before anything is tried). */
export function extractCheck(body: string, tree: TemplateItem[], entry: Entry): ExtractCheck {
  if (!entry.el.closed && !entry.el.selfClose) return { ok: false, why: `<${entry.el.name}> has no closing tag.` };
  const d = dynamicPart(entry.el);
  if (d) return { ok: false, why: `Only static markup can be extracted: ${d}, which reads this component's state.` };
  return { ok: true, copies: copiesOf(body, elementsOf(tree), entry).length };
}

/** `ProductCard` → `product-card`, `HTMLCard` → `html-card`. */
export const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

/** Does `selector` (`app-x`, `li[app-x]`, `[uiButton]`) select this element? Selectors of other shapes never match. */
function selects(selector: string, el: El): boolean {
  const m = /^([a-zA-Z][\w-]*)?((?:\[[\w-]+(?:=[^\]]*)?\])*)$/.exec(selector.trim());
  if (!m || (!m[1] && !m[2])) return false;
  if (m[1] && m[1].toLowerCase() !== el.name.toLowerCase()) return false;
  const names = new Set(el.attrInfo.map((a) => a.name.toLowerCase()));
  return [...m[2]!.matchAll(/\[([\w-]+)/g)].every((a) => names.has(a[1]!.toLowerCase()));
}

/** The components the markup uses, found by their selectors; an unknown custom element is refused. */
function componentsUsed(el: El, palette: PaletteEntry[]): ComponentRef[] | EditError {
  const found = new Map<string, ComponentRef>();
  const known = palette.filter((p) => p.component && p.selector);
  const visit = (e: El): EditError | null => {
    const hits = known.filter((p) => selects(p.selector!, e));
    for (const h of hits) found.set(h.component!.name, h.component!);
    if (hits.length === 0 && e.name.includes("-")) return fail("invalid", `The Designer does not know which component <${e.name}> is (no component in the project has that selector), so it cannot import it in the new file.`);
    for (const it of e.items) {
      if (it.k !== "el") continue;
      const bad = visit(it);
      if (bad) return bad;
    }
    return null;
  };
  const bad = visit(el);
  return bad ?? [...found.values()];
}

/** Elements whose parent expects them as direct children (a `<li>` in a `<ul>`): extracting leaves a custom element there instead. */
const PLACED = new Set(["li", "tr", "td", "th", "thead", "tbody", "tfoot", "caption", "col", "colgroup", "option", "optgroup", "dt", "dd", "summary", "legend", "source", "track"]);

export function planExtract(ctx: ExtractCtx, op: ExtractOp): ExtractPlan | EditError {
  const name = op.name.trim();
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return fail("invalid", "Name the component in PascalCase, such as ProductCard.");
  const base = kebab(name);
  const tag = base.startsWith("app-") ? base : `app-${base}`;
  const createdRel = posix.join(posix.dirname(ctx.rel), `${base}.ts`);
  const createdAbs = join(dirname(ctx.abs), `${base}.ts`);
  if (existsSync(createdAbs)) return fail("invalid", `${createdRel} already exists: choose another name.`);
  if (new RegExp(`(^|[^\\w$])${name}(?![\\w$])`).test(ctx.text)) return fail("invalid", `${name} is already a name in ${ctx.rel}: choose another.`);
  const palette = ctx.palette();
  if (palette.some((p) => p.component?.name === name)) return fail("invalid", `The project already has a component called ${name}.`);
  if (palette.some((p) => p.selector === tag)) return fail("invalid", `The project already has a component with the selector ${tag}.`);

  const { text, lit, fo } = ctx;
  const body = text.slice(lit.open, lit.close);
  const tree = parseTemplateTree(body);
  const entries = elementsOf(tree);
  const entry = findTarget(entries, op.target);
  if ("ok" in entry) return entry;
  const check = extractCheck(body, tree, entry);
  if (!check.ok) return fail("readonly", check.why);
  const used = componentsUsed(entry.el, palette);
  if ("ok" in used) return used;

  // --- the new file -------------------------------------------------------------------------------------------------
  const htmlImport = /^import\s*\{[^}]*\bhtml\b[^}]*\}\s*from\s*(['"])([^'"\n]+)\1(;?)/m.exec(text);
  const quote = htmlImport?.[1] ?? "'";
  const semi = htmlImport ? htmlImport[3] : ";";
  const spec = htmlImport?.[2] ?? "@gable/core";
  const unit = fo.useTabs ? "\t" : " ".repeat(fo.indentSize);
  const markup = formatTemplate(body.slice(entry.el.start, entry.el.end), { indentSize: fo.indentSize, useTabs: fo.useTabs, printWidth: Infinity });
  const importsLine = used.length ? `${unit}${unit}imports: [${used.map((u) => u.name).join(", ")}],\n` : "";
  let created =
    `import { html } from ${quote}${spec}${quote}${semi}\n\n` +
    `export class ${name} {\n` +
    `${unit}static meta = {\n` +
    `${unit}${unit}selector: ${quote}${tag}${quote},\n` +
    importsLine +
    `${unit}${unit}template: html\`\n${markup}\n\`,\n` +
    `${unit}};\n` +
    `}\n`;
  const span = findHtmlLiterals(created)[0]!;
  created = created.slice(0, span.open) + formatTemplateLiteral(created, span, fo) + created.slice(span.close);
  for (const u of used) {
    const hunks = ensureImport(created, u.name, u.file, createdRel);
    let out = "";
    let at = 0;
    for (const h of hunks) (out += created.slice(at, h.start) + h.text), (at = h.end);
    created = out + created.slice(at);
  }

  // --- the source: the element (and its copies) replaced, the class imported ----------------------------------------
  const replaced = op.all ? copiesOf(body, entries, entry) : [entry];
  const usage = `<${tag}></${tag}>`;
  const applied = applyPlan(text, lit, entry, { label: "", hunks: replaced.map((e) => ({ start: e.el.start, end: e.el.end, text: usage })), select: { startOffset: entry.el.start } }, fo);
  const hunks: Hunk[] = applied.hunk ? [{ start: lit.open + applied.hunk.start, end: lit.open + applied.hunk.end, text: applied.hunk.text }] : [];
  const metaHunks = ensureMetaImport(text, lit.open, name);
  if ("ok" in metaHunks) return metaHunks;
  hunks.push(...metaHunks, ...ensureImport(text, name, createdRel, ctx.rel));

  let select: ExtractPlan["select"] = null;
  if (applied.selectOrdinal !== null) {
    const after = elementsOf(parseTemplateTree(applied.body))[applied.selectOrdinal];
    if (after) select = { raw: applied.body, offset: after.el.start };
  }

  const notes: string[] = [];
  const meta = metaAround(text, lit.open);
  const encapsulation = meta?.props.find((p) => p.key === "encapsulation");
  const scopedStyles = meta?.props.some((p) => p.key === "styles") && !(encapsulation && /^['"]none['"]$/.test(text.slice(encapsulation.valueStart, encapsulation.valueEnd)));
  if (scopedStyles) notes.push(`The scoped styles of ${ctx.rel} do not reach ${name}: move the rules its markup needs.`);
  if (PLACED.has(entry.el.name.toLowerCase())) notes.push(`<${entry.el.name}> is now inside <${tag}>, so its parent has a custom element where it expects <${entry.el.name}>.`);
  const label = `Extract ${name}` + (replaced.length > 1 ? ` (${replaced.length} places)` : "");
  return { hunks, label, select, created: { abs: createdAbs, text: created }, ...(notes.length ? { note: notes.join(" ") } : {}) };
}
