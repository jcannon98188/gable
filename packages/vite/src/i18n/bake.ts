// Baking: rewrites the marked text of `html` templates and `i18n` tagged templates to one locale's translations,
// and removes the markers, so the output needs no catalog and no locale switching.
import { extractTemplateMessages, messageFromParts, messageFromStrings, messageId, parseMarker, parseMessage, type MessageNode } from "@gable/core/tooling";
import { assertNoEscapes } from "./extract.js";
import { cook, lineOf, scanTemplates } from "./scan.js";

export interface BakeOptions {
  /** Looks up the translation of a message id. `undefined` means there is none. */
  translate(id: string): string | undefined;
  /** Called for each message with no translation; the source text is used. */
  missing(info: { id: string; message: string; description: string; location: string }): void;
}

export interface BakeResult {
  code: string;
  /** How many messages were rewritten. */
  count: number;
}

export const BAKE_PRELUDE = `import { computed as __gableComputed } from "@gable/core";\nconst __gableValue = (v) => (typeof v === "function" && v.length === 0 ? v() : v);\n`;

/** Bakes one module. Returns the same code when there is nothing to do. */
export function bakeSource(code: string, file: string, options: BakeOptions): BakeResult {
  if (!code.includes("i18n")) return { code, count: 0 };
  const edits: Edit[] = [];
  let count = 0;
  let needsPrelude = false;

  for (const hit of scanTemplates(code)) {
    const line = lineOf(code, hit.start);
    const where = `${file}:${line}`;
    if (hit.tag === "html") {
      if (hit.holes.length > 0 || !hit.raw[0]!.includes("i18n")) continue;
      const raw = hit.raw[0]!;
      assertNoEscapes(raw, file, line);
      const baked = bakeHtml(raw, where, options);
      count += baked.count;
      if (baked.html !== raw) edits.push({ start: hit.start, end: hit.end, text: baked.html });
    } else {
      const { message, marker } = messageFromStrings(hit.raw.map(cook), hit.raw);
      const id = marker.id ?? messageId(message, marker.description);
      const exprs = hit.holes.map((h) => code.slice(h.start, h.end).trim());
      const text = renderTranslation(id, message, marker.description, where, options, exprs, "code");
      edits.push({ start: hit.tagStart, end: hit.end + 1, text: `__gableComputed(() => \`${text}\`)` });
      needsPrelude = true;
      count++;
    }
  }
  if (edits.length === 0) return { code, count };
  const out = applyEdits(code, edits);
  return { code: needsPrelude ? BAKE_PRELUDE + out : out, count };
}

interface Edit {
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
function renderTranslation(id: string, message: string, description: string, where: string, options: BakeOptions, exprs: readonly string[], target: "html" | "code"): string {
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
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      if (target === "html" && (node.includes("<") || node.includes("{{"))) {
        throw new Error(`${where}: translation of message ${id} contains "<" or "{{", which cannot be baked into template text`);
      }
      out += node.replace(/\\|`|\$\{/g, (m) => `\\${m}`);
    } else if (node.kind === "arg" && /^\d+$/.test(node.name)) {
      const expr = exprs[Number(node.name)];
      if (expr === undefined) throw new Error(`${where}: translation of message ${id} uses {${node.name}}, but the message has only ${exprs.length} placeholder(s)`);
      out += target === "html" ? `{{ ${expr} }}` : `\${__gableValue(${expr})}`;
    } else {
      throw new Error(
        `${where}: translation of message ${id} uses plural, select, number or date forms, which a baked build cannot format without the i18n runtime; use the runtime mode for it, or write the translation with plain placeholders`,
      );
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
      if (!a.name.startsWith("i18n-") || a.name.length <= 5) continue;
      const target = attrs.find((t) => t.name === a.name.slice(5));
      const info = next();
      if (!target || target.value === undefined) continue; // the parser has already rejected this
      const text = renderTranslation(info.id, info.message, info.description, where, options, [], "code");
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
      parts.push(s);
    });
    const message = messageFromParts(parts);
    const m = parseMarker(marker.value ?? "");
    const id = m.id ?? messageId(message, m.description);
    if (id !== info.id) throw new Error(`${where}: the build and the template parser disagree about the message in <${tag} i18n> (${id} vs ${info.id})`);
    edits.push({ start: openEnd, end: close, text: renderTranslation(id, message, info.description, where, options, exprs, "html") });
  }
  if (found !== expected.length) throw new Error(`${where}: the build found ${found} i18n messages, the template parser ${expected.length}`);
  return { html: applyEdits(source, edits), count: found };
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
