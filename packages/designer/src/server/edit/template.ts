// Template-side edits. The position authority is @gable/template-format's lossless parser (`parseTemplateTree`): every
// element, attribute, text run and block has source offsets there, and the runtime's `pos` is only a handle into that tree
// (matched by the offset of the `<` and checked by tag name, so a stale handle is refused rather than mapped to the wrong place).
// Everything here works on one template literal's body, as the LF text JavaScript sees (the file side maps CRLF), and turns an
// operation into text hunks: replacements of exactly the characters that change, plus new lines where markup is inserted.
import { findHtmlLiterals, formatTemplate, formatTemplateLiteral, parseTemplateTree, type AttrInfo, type TemplateItem, type TemplateLiteralSpan } from "@gable/template-format";
import { VOID } from "@gable/core/tooling";
import { diffHunk, type Hunk } from "./hunks.js";
import type { AttrModel, BindingKind, EditError, EditOp, NodeModel, SiblingRef, TargetRef, TextModel, Where, WrapWith } from "./types.js";

export type El = Extract<TemplateItem, { k: "el" }>;

export interface FormatOptions {
  indentSize: number;
  useTabs: boolean;
  printWidth: number;
}

export const DEFAULT_FORMAT: FormatOptions = { indentSize: 2, useTabs: false, printWidth: 80 };

export const fail = (code: EditError["code"], error: string): EditError => ({ ok: false, code, error });
const isError = (x: unknown): x is EditError => !!x && typeof x === "object" && (x as EditError).ok === false;

// --- locating ----------------------------------------------------------------------------------------------------

/** The `html` literal of `text` (LF) whose body is exactly `raw`. Identical literals cannot be told apart, so they are refused. */
export function locateLiteral(text: string, raw: string): { lit: TemplateLiteralSpan } | EditError {
  if (raw.includes("\\")) return fail("escapes", "This template contains escapes (a backslash), so its source positions are not exact; it cannot be edited visually.");
  const matches = findHtmlLiterals(text).filter((l) => text.slice(l.open, l.close) === raw);
  if (matches.length === 0) return fail("stale", "The template is not in the file any more: it was edited since it was selected.");
  if (matches.length > 1) return fail("ambiguous", "Another template in this file has exactly the same text, so the edit cannot tell them apart. Make one of them different first.");
  return { lit: matches[0]! };
}

export interface Entry {
  el: El;
  ordinal: number;
  container: TemplateItem[];
  index: number;
  parent: El | null;
}

/** Every element of a template in document order, with its place in the tree. The ordinal is the handle. */
export function elementsOf(tree: TemplateItem[]): Entry[] {
  const out: Entry[] = [];
  const walk = (items: TemplateItem[], parent: El | null) => {
    items.forEach((it, index) => {
      if (it.k === "el") {
        out.push({ el: it, ordinal: out.length, container: items, index, parent });
        walk(it.items, it);
      } else if (it.k === "chain") for (const p of it.parts) walk(p.items, parent);
    });
  };
  walk(tree, null);
  return out;
}

export function findTarget(entries: Entry[], ref: { start: number; tag: string }): Entry | EditError {
  const hit = entries.find((e) => e.el.start === ref.start);
  if (!hit || hit.el.name.toLowerCase() !== ref.tag.toLowerCase()) {
    return fail("stale", "The element is not where the preview says it is any more (the template changed since it was selected).");
  }
  if (!hit.el.closed && !hit.el.selfClose && !VOID.has(hit.el.name.toLowerCase())) return fail("invalid", `<${hit.el.name}> has no closing tag, so the template cannot be edited safely.`);
  return hit;
}

// --- text helpers ------------------------------------------------------------------------------------------------

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (s: string, i: number) => {
  const n = s.indexOf("\n", i);
  return n === -1 ? s.length : n;
};
const indentOf = (s: string, i: number) => /^[ \t]*/.exec(s.slice(lineStart(s, i)))![0];
const ownLine = (s: string, a: number, b: number) => s.slice(lineStart(s, a), a).trim() === "" && s.slice(b, lineEnd(s, b)).trim() === "";
const unitOf = (fo: FormatOptions) => (fo.useTabs ? "\t" : " ".repeat(fo.indentSize));

/** A plain read of a signal: `count`, `count()`, `todo.title`, `store.items()`. The only expressions the Designer writes. */
export const SIMPLE_READ = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const ATTR_NAME = /^[A-Za-z_:][\w:.-]*$/;
const BLOCK_KW = /(^|[^\w$.])@(?:if|else|for|empty|switch|case|default|let|defer|placeholder|loading|error)(?![\w$])/;
const INTERPOLATION = /\{\{[\s\S]*?\}\}/g;
const interpolations = (s: string) => (s.match(INTERPOLATION) ?? []).map((m) => m.slice(2, -2).trim());

/** Characters that would end or change the meaning of a template literal, or its structure. */
const unsafeValue = (s: string) => s.includes("\\") || s.includes("`") || s.includes("${");

// --- the node model (what the Edit panel shows) ------------------------------------------------------------------

interface Run {
  start: number;
  end: number;
}

function textRuns(items: TemplateItem[]): Run[] {
  const runs: Run[] = [];
  let open: Run | null = null;
  for (const it of items) {
    if (it.k === "word") {
      if (open) open.end = it.end;
      else runs.push((open = { start: it.start, end: it.end }));
    } else open = null;
  }
  return runs;
}

const hasI18n = (el: El) => el.attrInfo.some((a) => a.name === "i18n" || a.name.startsWith("i18n-"));

function classifyAttr(a: AttrInfo, body: string): AttrModel {
  const value = a.valueStart < 0 ? "" : body.slice(a.valueStart, a.valueEnd);
  const base = { name: a.name, value };
  const n = a.name;
  if (n === "i18n" || n.startsWith("i18n-")) return { ...base, kind: "i18n", editable: false, why: "Translation markers are managed with the i18n tooling." };
  if (n.startsWith("[(")) {
    const simple = SIMPLE_READ.test(value.trim());
    return { ...base, kind: "model", editable: simple, ...(simple ? { signal: value.trim() } : { why: "A dynamic expression: shown, never rewritten." }) };
  }
  if (n.startsWith("[")) {
    const simple = SIMPLE_READ.test(value.trim());
    return { ...base, kind: "binding", editable: simple, ...(simple ? { signal: value.trim() } : { why: "A dynamic expression: shown, never rewritten." }) };
  }
  if (n.startsWith("(")) return { ...base, kind: "event", editable: false, why: "Event handlers are code: shown, never rewritten." };
  if (n.startsWith("#")) return { ...base, kind: "ref", editable: false, why: "Template references are used by the component's code." };
  if (n.startsWith("*") || n.startsWith("@") || value.includes("{{")) return { ...base, kind: "other", editable: false, why: "Not a static attribute." };
  return { ...base, kind: "static", editable: true };
}

export function describeElement(body: string, tree: TemplateItem[], entry: Entry, file: string, fileLine: (offsetInBody: number) => number): NodeModel {
  const { el } = entry;
  const i18n = hasI18n(el);
  const raw = el.raw !== null;
  const contentWhy = i18n ? "This element is translatable (i18n): its text is edited in the message catalog." : raw ? `The content of <${el.name}> is raw text.` : undefined;
  const runs = el.selfClose || VOID.has(el.name.toLowerCase()) ? [] : textRuns(el.items);
  const text: TextModel[] = runs.map((r, run) => {
    const written = body.slice(r.start, r.end);
    const dynamic = (written.match(INTERPOLATION) ?? []).length;
    return { run, text: written.replace(/\s+/g, " "), editable: !contentWhy, ...(contentWhy ? { why: contentWhy } : {}), dynamic };
  });
  const siblings = entry.container.filter((it): it is El => it.k === "el");
  const at = siblings.indexOf(el);
  const ref = (e: El | undefined): SiblingRef | null => (e ? { start: e.start, tag: e.name } : null);
  const canHaveChildren = !el.selfClose && !VOID.has(el.name.toLowerCase()) && !raw && el.closeStart >= 0;
  const children: NodeModel["children"] = [];
  let lastWasText = false;
  for (const it of el.items) {
    if (it.k === "word") {
      if (!lastWasText) children.push({ kind: "text", label: "text", start: it.start });
      lastWasText = true;
      continue;
    }
    lastWasText = false;
    if (it.k === "el") children.push({ kind: "element", label: `<${it.name}>`, start: it.start, tag: it.name });
    else if (it.k === "chain") children.push({ kind: "block", label: it.parts[0]!.head.replace(/\s*\{$/, ""), start: it.start });
    else if (it.k === "comment") children.push({ kind: "comment", label: "comment", start: it.start });
    else children.push({ kind: "block", label: it.text, start: it.start });
  }
  return {
    ok: true,
    tag: el.name,
    ordinal: entry.ordinal,
    file,
    line: fileLine(el.start),
    attrs: el.attrInfo.map((a) => classifyAttr(a, body)),
    text,
    canAddText: canHaveChildren && !contentWhy && runs.length === 0,
    ...(contentWhy ? { contentWhy } : {}),
    children,
    prev: ref(siblings[at - 1]),
    next: ref(siblings[at + 1]),
    parent: entry.parent ? { start: entry.parent.start, tag: entry.parent.name } : null,
    canHaveChildren,
  };
}

// --- planning ----------------------------------------------------------------------------------------------------

export interface Plan {
  label: string;
  /** Hunks in the coordinates of the template body. */
  hunks: Hunk[];
  /** The element to select afterwards: by ordinal in the template after the hunks (before formatting), `"same"` for the target's own, or none. */
  select: "same" | "none" | { startOffset: number };
  /** Names to import into the file and list in the owning component's `imports`. */
  component?: { name: string; file: string };
}

interface Ctx {
  body: string;
  tree: TemplateItem[];
  entries: Entry[];
  fo: FormatOptions;
  unit: string;
}

const snippetLines = (snippet: string, fo: FormatOptions): string[] | EditError => {
  const text = snippet.trim();
  if (text === "") return fail("invalid", "Nothing to insert.");
  if (unsafeValue(text)) return fail("invalid", "The markup contains characters that cannot be written into a template safely.");
  const tree = parseTemplateTree(text);
  const bad = (items: TemplateItem[]): boolean =>
    items.some((it) => (it.k === "el" ? (!it.closed && !it.selfClose && !VOID.has(it.name.toLowerCase())) || bad(it.items) : it.k === "word" ? it.text.startsWith("</") : it.k === "chain" ? it.parts.some((p) => bad(p.items)) : false));
  if (tree.length === 0 || bad(tree)) return fail("invalid", "The markup is not well formed (every element needs its closing tag).");
  return formatTemplate(text, { indentSize: fo.indentSize, useTabs: fo.useTabs, printWidth: fo.printWidth }).split("\n");
};

function placeSibling(body: string, ref: { start: number; end: number }, where: "before" | "after", lines: string[]): Hunk {
  if (ownLine(body, ref.start, ref.end)) {
    const indent = indentOf(body, ref.start);
    const text = lines.map((l) => (l === "" ? l : indent + l)).join("\n");
    if (where === "before") {
      const at = lineStart(body, ref.start);
      return { start: at, end: at, text: text + "\n" };
    }
    const at = lineEnd(body, ref.end);
    return { start: at, end: at, text: "\n" + text };
  }
  const flat = lines.join(" ");
  return where === "before" ? { start: ref.start, end: ref.start, text: flat + " " } : { start: ref.end, end: ref.end, text: " " + flat };
}

/** Where `lines` go as the first or last child of an element (or of the template root when `el` is null). */
function placeInside(ctx: Ctx, el: El | null, where: "first" | "last", lines: string[]): Hunk {
  const { body } = ctx;
  const items = el ? el.items : ctx.tree;
  if (items.length) return placeSibling(body, where === "first" ? items[0]! : items[items.length - 1]!, where === "first" ? "before" : "after", lines);
  if (!el) return { start: 0, end: body.length, text: lines.join("\n") };
  const indent = indentOf(body, el.start);
  if (ownLine(body, el.start, el.end) || body.slice(el.openEnd, el.closeStart).includes("\n")) {
    return { start: el.openEnd, end: el.closeStart, text: "\n" + lines.map((l) => (l === "" ? l : indent + ctx.unit + l)).join("\n") + "\n" + indent };
  }
  return { start: el.openEnd, end: el.closeStart, text: lines.join(" ") };
}

function placeRelative(ctx: Ctx, entry: Entry | null, where: Where, lines: string[]): Hunk | EditError {
  if (!entry) return where === "first" || where === "last" ? placeInside(ctx, null, where, lines) : fail("invalid", "The template root has no siblings.");
  if (where === "before" || where === "after") return placeSibling(ctx.body, entry.el, where, lines);
  if (entry.el.closeStart < 0 || entry.el.raw !== null) return fail("invalid", `<${entry.el.name}> cannot have children.`);
  return placeInside(ctx, entry.el, where, lines);
}

const staticAttrError = (name: string): EditError | null => (ATTR_NAME.test(name) ? null : fail("invalid", `"${name}" is not a plain attribute name.`));

/** The hunk that adds ` name="value"` to an element's opening tag, next to the existing attributes. */
function addAttribute(ctx: Ctx, el: El, written: string): Hunk {
  const last = el.attrInfo[el.attrInfo.length - 1];
  if (!last) return { start: el.nameEnd, end: el.nameEnd, text: " " + written };
  const multiline = el.attrInfo.length > 0 && ctx.body.slice(el.start, last.start).includes("\n");
  const text = multiline ? "\n" + indentOf(ctx.body, el.attrInfo[0]!.start) + written : " " + written;
  return { start: last.end, end: last.end, text };
}

const quoteValue = (value: string, prefer: string): string | EditError => {
  let q = prefer === "'" ? "'" : '"';
  if (value.includes(q)) {
    q = q === '"' ? "'" : '"';
    if (value.includes(q)) return fail("invalid", "The value contains both kinds of quotes.");
  }
  return q + value + q;
};

function removeAttribute(body: string, a: AttrInfo): Hunk {
  let from = a.start;
  while (from > 0 && /\s/.test(body[from - 1]!)) from--;
  return { start: from, end: a.end, text: "" };
}

function attrName(kind: BindingKind, name: string): string {
  switch (kind) {
    case "prop":
      return `[${name}]`;
    case "model":
      return `[(${name})]`;
    default:
      return `[${kind}.${name}]`;
  }
}

/** Replaces word runs by merging the new text into the old so words that did not change keep their exact whitespace. */
function mergeText(old: string, next: string): string {
  const words = [...old.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
  const fresh = next.split(/\s+/).filter(Boolean);
  let p = 0;
  while (p < words.length && p < fresh.length && words[p]!.text === fresh[p]) p++;
  let s = 0;
  while (s < words.length - p && s < fresh.length - p && words[words.length - 1 - s]!.text === fresh[fresh.length - 1 - s]) s++;
  const mid = fresh.slice(p, fresh.length - s).join(" ");
  const from = p > 0 ? words[p - 1]!.end : 0;
  const to = s > 0 ? words[words.length - s]!.start : old.length;
  const glueBefore = p > 0 && mid !== "" ? " " : "";
  const glueAfter = s > 0 && mid !== "" ? " " : "";
  const sep = mid === "" && p > 0 && s > 0 ? " " : "";
  return old.slice(0, from) + glueBefore + mid + glueAfter + sep + old.slice(to);
}

function checkText(text: string, oldDynamic: string[]): EditError | null {
  if (unsafeValue(text)) return fail("invalid", "The text contains characters that cannot be written into a template safely (backslash, backtick or ${).");
  const dynamic = interpolations(text);
  if (dynamic.length !== oldDynamic.length || dynamic.some((d, i) => d !== oldDynamic[i])) {
    return fail("readonly", "The {{ }} expressions in text are read-only: keep them as they are, in the same order.");
  }
  const stripped = text.replace(INTERPOLATION, "");
  if (/[<{}]/.test(stripped)) return fail("invalid", "Text cannot contain <, { or } (they are template syntax).");
  if (BLOCK_KW.test(stripped)) return fail("invalid", "Text cannot start a block (@if, @for, ...).");
  return null;
}

export function plan(ctx: Ctx, op: EditOp): { plan: Plan; entry: Entry | null } | EditError {
  const { body, entries } = ctx;
  const entryOf = (ref: TargetRef): Entry | null | EditError => (ref.start === -1 ? null : findTarget(entries, ref));
  const need = (ref: TargetRef): Entry | EditError => {
    const e = findTarget(entries, ref);
    return e;
  };
  const done = (entry: Entry | null, p: Plan) => ({ plan: p, entry });

  switch (op.op) {
    case "setText": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const model = describeElement(body, ctx.tree, entry, "", () => 0);
      const run = model.text[op.run];
      const runs = textRuns(entry.el.items);
      if (!run || !runs[op.run]) return fail("invalid", "That text is not in the element (it changed).");
      if (!run.editable) return fail("readonly", run.why ?? "Read-only.");
      const r = runs[op.run]!;
      const bad = checkText(op.text, interpolations(body.slice(r.start, r.end)));
      if (bad) return bad;
      const merged = mergeText(body.slice(r.start, r.end), op.text.trim());
      return done(entry, { label: "Edit text", hunks: [{ start: r.start, end: r.end, text: merged }], select: "same" });
    }
    case "addText": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const model = describeElement(body, ctx.tree, entry, "", () => 0);
      if (!model.canAddText) return fail("invalid", model.contentWhy ?? "This element already has text, or cannot hold any.");
      const bad = checkText(op.text, []);
      if (bad) return bad;
      const h = placeInside(ctx, entry.el, "first", [op.text.trim()]);
      return done(entry, { label: "Add text", hunks: [h], select: "same" });
    }
    case "setAttr": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const bad = staticAttrError(op.name) ?? (unsafeValue(op.value) ? fail("invalid", "The value contains characters that cannot be written into a template safely.") : null);
      if (bad) return bad;
      const existing = entry.el.attrInfo.find((a) => a.name === op.name);
      if (existing) {
        const model = classifyAttr(existing, body);
        if (model.kind !== "static") return fail("readonly", model.why ?? `"${op.name}" is not a static attribute.`);
        const quote = existing.quote;
        const q = quoteValue(op.value, quote);
        if (isError(q)) return q;
        if (existing.valueStart < 0) return done(entry, { label: `Set ${op.name}`, hunks: [{ start: existing.end, end: existing.end, text: "=" + q }], select: "same" });
        const from = quote ? existing.valueStart - 1 : existing.valueStart;
        const to = quote && body[existing.valueEnd] === quote ? existing.valueEnd + 1 : existing.valueEnd;
        return done(entry, { label: `Set ${op.name}`, hunks: [{ start: from, end: to, text: q }], select: "same" });
      }
      const q = quoteValue(op.value, '"');
      if (isError(q)) return q;
      return done(entry, { label: `Add ${op.name}`, hunks: [addAttribute(ctx, entry.el, `${op.name}=${q}`)], select: "same" });
    }
    case "removeAttr": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const a = entry.el.attrInfo.find((x) => x.name === op.name);
      if (!a) return fail("stale", `<${entry.el.name}> has no "${op.name}" any more.`);
      const model = classifyAttr(a, body);
      if (!model.editable) return fail("readonly", model.why ?? "Read-only.");
      return done(entry, { label: `Remove ${op.name}`, hunks: [removeAttribute(body, a)], select: "same" });
    }
    case "setBinding": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      if (!/^[A-Za-z_][\w-]*$/.test(op.name)) return fail("invalid", `"${op.name}" is not a plain name.`);
      const expr = op.expr.trim();
      if (!SIMPLE_READ.test(expr)) return fail("invalid", "Only a plain signal read, such as count(), can be bound from the picker.");
      const full = attrName(op.kind, op.name);
      const existing = entry.el.attrInfo.find((a) => a.name === full);
      if (existing) {
        const model = classifyAttr(existing, body);
        if (!model.editable) return fail("readonly", model.why ?? "Read-only.");
        const from = existing.quote ? existing.valueStart - 1 : existing.valueStart;
        const to = existing.quote && body[existing.valueEnd] === existing.quote ? existing.valueEnd + 1 : existing.valueEnd;
        return done(entry, { label: `Bind ${full}`, hunks: [{ start: from, end: to, text: `"${expr}"` }], select: "same" });
      }
      if (entry.el.attrInfo.some((a) => a.name === op.name && op.kind !== "class" && op.kind !== "style")) {
        return fail("invalid", `<${entry.el.name}> already has a static "${op.name}": remove it before binding it.`);
      }
      return done(entry, { label: `Bind ${full}`, hunks: [addAttribute(ctx, entry.el, `${full}="${expr}"`)], select: "same" });
    }
    case "addTextBinding": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const expr = op.expr.trim();
      if (!SIMPLE_READ.test(expr)) return fail("invalid", "Only a plain signal read, such as count(), can be bound from the picker.");
      const model = describeElement(body, ctx.tree, entry, "", () => 0);
      if (!model.canHaveChildren) return fail("invalid", `<${entry.el.name}> cannot hold text.`);
      if (model.contentWhy) return fail("readonly", model.contentWhy);
      const last = entry.el.items[entry.el.items.length - 1];
      const written = `{{ ${expr} }}`;
      const h: Hunk = last && last.k === "word" ? { start: last.end, end: last.end, text: " " + written } : placeInside(ctx, entry.el, "last", [written]);
      return done(entry, { label: "Bind text", hunks: [h], select: "same" });
    }
    case "insert": {
      const entry = entryOf(op.target);
      if (isError(entry)) return entry;
      if (entry === null && op.target.start !== -1) return fail("invalid", "Bad target.");
      const lines = snippetLines(op.snippet, ctx.fo);
      if (isError(lines)) return lines;
      const h = placeRelative(ctx, entry, op.where, lines);
      if (isError(h)) return h;
      const plan: Plan = { label: "Insert " + (op.snippet.match(/^\s*<([\w-]+)/)?.[1] ? `<${op.snippet.match(/^\s*<([\w-]+)/)![1]}>` : "markup"), hunks: [h], select: { startOffset: h.start }, ...(op.component ? { component: { name: op.component.name, file: op.component.file } } : {}) };
      return done(entry, plan);
    }
    case "delete": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      return done(entry, { label: `Delete <${entry.el.name}>`, hunks: [removeElement(body, entry.el)], select: "none" });
    }
    case "move": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const dest = need(op.to);
      if (isError(dest)) return dest;
      if (dest.el === entry.el || (dest.el.start >= entry.el.start && dest.el.end <= entry.el.end)) return fail("invalid", "An element cannot be moved into itself.");
      const el = entry.el;
      const own = ownLine(body, el.start, el.end);
      const slice = own ? body.slice(lineStart(body, el.start), lineEnd(body, el.end)) : body.slice(el.start, el.end);
      const dedent = own ? indentOf(body, el.start) : "";
      const lines = slice.split("\n").map((l) => (dedent && l.startsWith(dedent) ? l.slice(dedent.length) : l));
      const h = placeRelative(ctx, dest, op.where, lines);
      if (isError(h)) return h;
      return done(entry, { label: `Move <${el.name}>`, hunks: [removeElement(body, el), h], select: "none" });
    }
    case "wrap": {
      const entry = need(op.target);
      if (isError(entry)) return entry;
      const head = wrapHead(op.with);
      if (isError(head)) return head;
      const el = entry.el;
      if (ownLine(body, el.start, el.end)) {
        const start = lineStart(body, el.start);
        const end = lineEnd(body, el.end);
        const indent = indentOf(body, el.start);
        const inner = body
          .slice(start, end)
          .split("\n")
          .map((l) => (l === "" ? l : ctx.unit + l))
          .join("\n");
        return done(entry, { label: `Wrap in @${op.with.kind}`, hunks: [{ start, end, text: `${indent}${head} {\n${inner}\n${indent}}` }], select: "same" });
      }
      return done(entry, { label: `Wrap in @${op.with.kind}`, hunks: [{ start: el.start, end: el.end, text: `${head} { ${body.slice(el.start, el.end)} }` }], select: "same" });
    }
    default:
      return fail("invalid", `Unknown operation ${(op as { op: string }).op}.`);
  }
}

function removeElement(body: string, el: El): Hunk {
  if (ownLine(body, el.start, el.end)) {
    const start = lineStart(body, el.start);
    const end = Math.min(lineEnd(body, el.end) + 1, body.length);
    // Removing the last line of a body would leave the line before it without its break: take that break instead.
    if (end === body.length && body[end - 1] !== "\n" && start > 0) return { start: start - 1, end, text: "" };
    return { start, end, text: "" };
  }
  return { start: el.start, end: el.end, text: "" };
}

function wrapHead(w: WrapWith): string | EditError {
  if (w.kind === "if") {
    return SIMPLE_READ.test(w.cond.trim()) || /^!\s*[A-Za-z_$][\w$.]*(?:\(\))?$/.test(w.cond.trim()) ? `@if (${w.cond.trim()})` : fail("invalid", "Pick a signal for the condition (a plain read such as visible()).");
  }
  const track = w.track.trim();
  if (!IDENT.test(w.item) || !SIMPLE_READ.test(w.source.trim())) return fail("invalid", "Pick a signal to loop over and name the loop variable.");
  if (!(track === "$index" || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(track))) return fail("invalid", "The track expression must be $index or a property of the item, such as item.id.");
  return `@for (${w.item} of ${w.source.trim()}; track ${track})`;
}

// --- the whole-literal step: formatting and the minimal hunk -------------------------------------------------------

export interface Applied {
  /** The literal's new body. */
  body: string;
  /** One minimal replacement inside the body (offsets in the old body); null when nothing changed. */
  hunk: Hunk | null;
  /** The element to select afterwards, by ordinal in the new body. */
  selectOrdinal: number | null;
}

/**
 * Applies a plan to a template body. A body the repo formatter would leave alone is reformatted whole after the edit, so the
 * result is the formatter's output; a body that was not formatted is only touched where the edit is (the inserted markup is
 * already laid out like the formatter would), so the diff stays small and nothing else is reflowed.
 */
export function applyPlan(text: string, lit: TemplateLiteralSpan, target: Entry | null, p: Plan, fo: FormatOptions): Applied {
  const body = text.slice(lit.open, lit.close);
  const sorted = [...p.hunks].sort((a, b) => a.start - b.start || a.end - b.end);
  let raw = "";
  let at = 0;
  for (const h of sorted) {
    if (h.start < at) throw new Error("Overlapping edits.");
    raw += body.slice(at, h.start) + h.text;
    at = h.end;
  }
  raw += body.slice(at);

  const wasClean = formatTemplateLiteral(text, lit, fo) === body;
  let next = raw;
  const rawEntries = elementsOf(parseTemplateTree(raw));
  let selectOrdinal: number | null = null;
  if (p.select === "same") selectOrdinal = target ? target.ordinal : null; // these edits add and remove no elements
  else if (typeof p.select === "object") {
    const wanted = p.select.startOffset;
    const insert = sorted.find((h) => h.start === wanted) ?? sorted[0]!;
    const found = rawEntries.find((e) => e.el.start >= insert.start && e.el.start < insert.start + insert.text.length);
    selectOrdinal = found ? found.ordinal : null;
  }
  if (wasClean) {
    const probe = text.slice(0, lit.open) + raw + text.slice(lit.close);
    const span = findHtmlLiterals(probe).find((l) => l.open === lit.open);
    if (span) next = formatTemplateLiteral(probe, span, fo);
  }
  return { body: next, hunk: diffHunk(body, next), selectOrdinal };
}
