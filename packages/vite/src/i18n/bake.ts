// Baking: rewrites the marked text of `html` templates and `i18n` tagged templates to one locale's translations,
// and removes the markers, so the output needs no catalog and no locale switching.
import MagicString, { type SourceMap } from "magic-string";
import { decodeEntities, encodeEntities, dateFormatOptions, extractTemplateMessages, messageFromParts, messageFromStrings, messageId, numberFormatOptions, parseMarker, parseMessage, type MessageNode } from "@gable/core/tooling";
import { assertNoEscapes } from "./extract.js";
import { DYNAMIC_CALL, cook, lineOf, scanTemplates } from "./scan.js";

/**
 * Options for {@link bakeSource} and {@link bakeHtml}: where translations come from and what to do when one is
 * missing. `gableI18n` fills these in from your catalogs; you only build them yourself when baking outside Vite.
 */
export interface BakeOptions {
  /** Looks up the translation of a message id. `undefined` means there is none. */
  translate(id: string): string | undefined;
  /** Called for each message with no translation; the source text is used. */
  missing(info: { id: string; message: string; description: string; location: string }): void;
  /** The locale being baked: plural rules and number and date formats of code messages are lowered for it. Default `en`. */
  locale?: string;
}

export interface BakeResult {
  code: string;
  /** A source map for the rewritten code (absent when nothing changed). */
  map?: SourceMap;
  /** How many messages were rewritten. */
  count: number;
}

/** Lines (1-based) of calls on the I18n service that a baked build cannot translate: `i18n.t(...)`, `.translate(...)`, not the tag form. */
export function dynamicCalls(code: string): number[] {
  if (!/i18n/i.test(code)) return [];
  const lines: number[] = [];
  for (const m of code.matchAll(DYNAMIC_CALL)) lines.push(lineOf(code, m.index));
  return lines;
}

const VALUE_HELPER = `const __gableValue = (v) => (typeof v === "function" && v.length === 0 ? v() : v);\n`;
/**
 * Helpers for plural, select, number and date forms in code messages. Each is a few lines over `Intl`; a module gets
 * only the ones its messages use, so no ICU parser or I18n service is shipped.
 */
const FORM_HELPERS = {
  num: `const __gableNum = (l, o, v) => { const n = Number(v); return v == null ? "" : Number.isNaN(n) ? String(v) : new Intl.NumberFormat(l, o).format(n); };
`,
  date: `const __gableDate = (l, o, v) => { const d = v instanceof Date ? v : new Date(v); return v == null ? "" : Number.isNaN(d.getTime()) ? String(v) : new Intl.DateTimeFormat(l, o).format(d); };
`,
  plural: `const __gablePlural = (l, t, n) => (Number.isNaN(n) ? "other" : new Intl.PluralRules(l, { type: t }).select(n));
`,
} as const;
type FormHelper = keyof typeof FORM_HELPERS;

export const BAKE_PRELUDE = `import { computed as __gableComputed } from "@gable/core";\n${VALUE_HELPER}`;

/** Bakes one module. Returns the same code when there is nothing to do. */
export function bakeSource(code: string, file: string, options: BakeOptions): BakeResult {
  if (!code.includes("i18n")) return { code, count: 0 };
  const s = new MagicString(code);
  let count = 0;
  let needsComputed = false;
  let needsValue = false;
  const helpers = new Set<FormHelper>();
  const locale = options.locale ?? "en";
  const apply = (e: Edit, offset = 0) => (e.text === "" ? s.remove(e.start + offset, e.end + offset) : s.overwrite(e.start + offset, e.end + offset, e.text));

  for (const hit of scanTemplates(code)) {
    const line = lineOf(code, hit.start);
    const where = `${file}:${line}`;
    if (hit.tag === "html") {
      if (hit.holes.length > 0 || !hit.raw[0]!.includes("i18n")) continue;
      const raw = hit.raw[0]!;
      assertNoEscapes(raw, file, line);
      const baked = bakeHtmlEdits(raw, where, options);
      count += baked.count;
      for (const e of baked.edits) apply(e, hit.start);
    } else {
      const { message, marker } = messageFromStrings(hit.raw.map(cook), hit.raw);
      const id = marker.id ?? messageId(message, marker.description);
      const exprs = hit.holes.map((h) => code.slice(h.start, h.end).trim());
      const text = renderTranslation(id, message, marker.description, where, options, exprs, "code", locale, helpers);
      needsValue = true;
      if (hit.tag === "t") {
        // `inject(I18n).t`...`` is a plain string read at the call, so it becomes a plain template literal.
        apply({ start: hit.tagStart, end: hit.end + 1, text: `\`${text}\`` });
      } else {
        needsComputed = true;
        apply({ start: hit.tagStart, end: hit.end + 1, text: `__gableComputed(() => \`${text}\`)` });
      }
      count++;
    }
  }
  if (count === 0) return { code, count };
  s.prepend((needsComputed ? BAKE_PRELUDE : needsValue ? VALUE_HELPER : "") + [...helpers].map((h) => FORM_HELPERS[h]).join(""));
  return { code: s.toString(), map: s.generateMap({ source: file, hires: "boundary", includeContent: true }), count };
}

export interface Edit {
  start: number;
  end: number;
  text: string;
}

function applyEdits(source: string, edits: Edit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/**
 * The translation (or the source message) of one id as text to put inside a template literal. `exprs` are the source
 * texts of the placeholders: in `html` mode they come back as `{{ expr }}`, in `code` mode as `${expr}` holes.
 */
function renderTranslation(
  id: string,
  message: string,
  description: string,
  where: string,
  options: BakeOptions,
  exprs: readonly string[],
  target: "html" | "attr" | "code",
  locale = "en",
  helpers: Set<FormHelper> = new Set(),
): string {
  let text = options.translate(id);
  if (text === undefined) {
    options.missing({ id, message, description, location: where });
    text = message;
  }
  let nodes: MessageNode[];
  try {
    nodes = parseMessage(text);
  } catch (error) {
    throw new Error(`${where}: translation of message ${id} is not valid: ${(error as Error).message}`);
  }
  if (target === "code") return lower(nodes, { id, where, exprs, locale: JSON.stringify(locale), helpers }, null, 0);
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      if (target === "html" && node.includes("{{")) {
        throw new Error(`${where}: translation of message ${id} contains "{{", which cannot be baked into template text`);
      }
      // The template parser decodes character references, so "<" and a literal "&lt;" are written as references.
      out += escapeText(encodeEntities(node));
    } else if (node.kind === "arg" && /^\d+$/.test(node.name)) {
      const expr = exprs[Number(node.name)];
      if (expr === undefined) throw new Error(`${where}: translation of message ${id} uses {${node.name}}, but the message has only ${exprs.length} placeholder(s)`);
      out += `{{ ${expr} }}`;
    } else {
      throw new Error(
        `${where}: translation of message ${id} uses plural, select, number or date forms, which cannot be baked into an html template or attribute (templates cannot call functions); use the runtime mode for it, write the translation with plain placeholders, or produce the text with the i18n tag in code`,
      );
    }
  }
  return out;
}

const escapeText = (text: string) => text.replace(/\\|`|\$\{/g, (m) => `\\${m}`);

interface Lowering {
  id: string;
  where: string;
  exprs: readonly string[];
  /** The locale as a JS string literal. */
  locale: string;
  helpers: Set<FormHelper>;
}

/**
 * Lowers a code message to the inside of a template literal. Plain text and placeholders stay as they are; plural,
 * select, number and date forms become inline expressions over `Intl` (the locale and the formats are known at build
 * time), so nothing parses ICU at runtime. `pound` is the expression `#` stands for inside a plural branch.
 */
function lower(nodes: readonly MessageNode[], ctx: Lowering, pound: string | null, depth: number): string {
  const arg = (name: string): string => {
    const expr = /^\d+$/.test(name) ? ctx.exprs[Number(name)] : undefined;
    if (expr === undefined) throw new Error(`${ctx.where}: translation of message ${ctx.id} uses {${name}}, but the message has only ${ctx.exprs.length} placeholder(s)`);
    return `__gableValue(${expr})`;
  };
  const branch = (cases: Record<string, MessageNode[]>, key: string, p: string | null) => "`" + lower(cases[key]!, ctx, p, depth + 1) + "`";
  const hole = (expr: string) => "${" + expr + "}";
  const json = JSON.stringify;
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") out += escapeText(node);
    else if (node.kind === "pound") out += pound === null ? "#" : hole(pound);
    else if (node.kind === "arg") out += hole(arg(node.name));
    else if (node.kind === "number") {
      ctx.helpers.add("num");
      out += hole(`__gableNum(${ctx.locale}, ${json(numberFormatOptions(node.style)) ?? "undefined"}, ${arg(node.name)})`);
    } else if (node.kind === "date" || node.kind === "time") {
      ctx.helpers.add("date");
      out += hole(`__gableDate(${ctx.locale}, ${json(dateFormatOptions(node.kind, node.style))}, ${arg(node.name)})`);
    } else if (node.kind === "select") {
      const s = `__s${depth}`;
      let chain = branch(node.cases, "other", pound);
      for (const key of Object.keys(node.cases).reverse()) if (key !== "other") chain = `${s} === ${json(key)} ? ${branch(node.cases, key, pound)} : ${chain}`;
      out += hole(`((${s}) => ${chain})(String(${arg(node.name)} ?? ""))`);
    } else {
      ctx.helpers.add("plural");
      ctx.helpers.add("num");
      const [v, a, k] = [`__v${depth}`, `__a${depth}`, `__k${depth}`];
      const inner = `__gableNum(${ctx.locale}, undefined, ${a})`;
      let chain = branch(node.cases, "other", inner);
      const keys = Object.keys(node.cases).filter((key) => key !== "other");
      for (const key of keys.filter((x) => !x.startsWith("=")).reverse()) chain = `${k} === ${json(key)} ? ${branch(node.cases, key, inner)} : ${chain}`;
      for (const key of keys.filter((x) => x.startsWith("=")).reverse()) chain = `"=" + ${v} === ${json(key)} ? ${branch(node.cases, key, inner)} : ${chain}`;
      const type = node.kind === "plural" ? "cardinal" : "ordinal";
      out += hole(`((${v}) => { const ${a} = ${v} - ${node.offset}; const ${k} = __gablePlural(${ctx.locale}, "${type}", ${a}); return ${chain}; })(Number(${arg(node.name)}))`);
    }
  }
  return out;
}

interface Attr {
  name: string;
  value: string | undefined;
  quote: string;
  /** Span of the attribute including its leading whitespace. */
  start: number;
  end: number;
}

const ATTR = /\s*([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

/** Bakes the markers of one template's source text. */
export function bakeHtml(source: string, where: string, options: BakeOptions): { html: string; count: number } {
  const { edits, count } = bakeHtmlEdits(source, where, options);
  return { html: applyEdits(source, edits), count };
}

/** The edits (offsets into `source`) that bake one template's markers. */
export function bakeHtmlEdits(source: string, where: string, options: BakeOptions): { edits: Edit[]; count: number } {
  const expected = extractTemplateMessages(source);
  const edits: Edit[] = [];
  let found = 0;
  const next = () => {
    const m = expected[found++];
    if (!m) throw new Error(`${where}: the build found more i18n markers than the template parser`);
    return m;
  };
  let p = 0;
  while (p < source.length) {
    const lt = nextTagStart(source, p);
    if (lt === -1) break;
    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt + 4);
      p = close === -1 ? source.length : close + 3;
      continue;
    }
    if (!/[A-Za-z]/.test(source[lt + 1] ?? "")) {
      p = lt + 1;
      continue;
    }
    const tag = /^<([A-Za-z][\w-]*)/.exec(source.slice(lt))![1]!;
    let q = lt + 1 + tag.length;
    const attrs: Attr[] = [];
    let selfClosing = false;
    for (;;) {
      const wsStart = q;
      while (/\s/.test(source[q] ?? "")) q++;
      if (q >= source.length) throw new Error(`${where}: unterminated <${tag}>`);
      if (source[q] === ">") {
        q++;
        break;
      }
      if (source.startsWith("/>", q)) {
        selfClosing = true;
        q += 2;
        break;
      }
      ATTR.lastIndex = q;
      const m = ATTR.exec(source);
      if (!m) throw new Error(`${where}: bad attribute in <${tag}>`);
      const start = wsStart;
      q = ATTR.lastIndex;
      attrs.push({ name: m[1]!, value: m[2] ?? m[3], quote: m[2] !== undefined ? '"' : "'", start, end: q });
    }
    const openEnd = q;
    p = openEnd;

    // Attribute order follows the parser: i18n-<attr> messages come in attribute order, before the element text.
    for (const a of attrs) {
      if (a.name === "i18n-ignore") {
        edits.push({ start: a.start, end: a.end, text: "" });
        continue;
      }
      if (!a.name.startsWith("i18n-") || a.name.length <= 5) continue;
      const target = attrs.find((t) => t.name === a.name.slice(5));
      const info = next();
      if (!target || target.value === undefined) continue; // the parser has already rejected this
      const text = renderTranslation(info.id, info.message, info.description, where, options, [], "attr");
      let quote = target.quote;
      if (text.includes(quote)) {
        quote = quote === '"' ? "'" : '"';
        if (text.includes(quote)) throw new Error(`${where}: translation of message ${info.id} contains both quote characters and cannot be baked into the ${target.name} attribute`);
      }
      const nameEnd = target.start + source.slice(target.start, target.end).indexOf(target.name) + target.name.length;
      edits.push({ start: nameEnd, end: target.end, text: `=${quote}${text}${quote}` });
      edits.push({ start: a.start, end: a.end, text: "" });
    }

    const marker = attrs.find((a) => a.name === "i18n");
    if (!marker) continue;
    edits.push({ start: marker.start, end: marker.end, text: "" });
    if (selfClosing || VOID.has(tag)) continue;
    const close = source.indexOf(`</${tag}`, openEnd);
    if (close === -1) throw new Error(`${where}: <${tag}> is not closed`);
    p = close;
    const inner = source.slice(openEnd, close);
    if (inner.trim() === "") continue;
    const info = next();
    const exprs = [...inner.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]!.trim());
    const parts: Array<string | { placeholder: true }> = [];
    inner.split(/\{\{[\s\S]*?\}\}/).forEach((s, i) => {
      if (i > 0) parts.push({ placeholder: true });
      parts.push(decodeEntities(s));
    });
    const message = messageFromParts(parts);
    const m = parseMarker(marker.value ?? "");
    const id = m.id ?? messageId(message, m.description);
    if (id !== info.id) throw new Error(`${where}: the build and the template parser disagree about the message in <${tag} i18n> (${id} vs ${info.id})`);
    edits.push({ start: openEnd, end: close, text: renderTranslation(id, message, info.description, where, options, exprs, "html") });
  }
  if (found !== expected.length) throw new Error(`${where}: the build found ${found} i18n messages, the template parser ${expected.length}`);
  return { edits, count: found };
}

/** Offset of the next `<` outside `{{ }}`, or -1. */
function nextTagStart(source: string, from: number): number {
  for (let p = from; p < source.length; p++) {
    if (source[p] === "<") return p;
    if (source[p] === "{" && source[p + 1] === "{") {
      const close = source.indexOf("}}", p + 2);
      if (close === -1) return -1;
      p = close + 1;
    }
  }
  return -1;
}
