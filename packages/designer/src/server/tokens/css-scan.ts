// A small lossless CSS scanner for design tokens: every block with the chain of at-rules and selectors it sits in, every
// declaration with its offsets, and the top-level `@import`s. Comments, strings and parentheses are skipped like the edit
// service's CSS scanner (edit/css.ts) does; nothing is reprinted, so patches made from these offsets are minimal.

export interface CssFrame {
  kind: "at" | "rule";
  /** The prelude, comments removed and whitespace collapsed: `@media (prefers-color-scheme: dark)`, `:root`. */
  text: string;
}

export interface CssBlock {
  chain: CssFrame[];
  /** Offset where the prelude starts, of the `{` and of the `}`. */
  start: number;
  open: number;
  close: number;
}

export interface CssDecl {
  property: string;
  /** As written, trimmed. */
  value: string;
  start: number;
  valueStart: number;
  /** End of the value (before `;` and trailing whitespace). */
  valueEnd: number;
  /** End including the `;` when there is one. */
  end: number;
  /** Index into `blocks`. */
  block: number;
}

export interface CssImport {
  /** The URL as written, without quotes or `url()`. */
  spec: string;
  start: number;
}

export interface CssScan {
  blocks: CssBlock[];
  decls: CssDecl[];
  imports: CssImport[];
}

export const normalizePrelude = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();

/** Skips a comment or string starting at `i`; returns the offset after it, or -1 when there is none at `i`. */
function skip(css: string, i: number, to: number): number {
  const c = css[i];
  if (c === "/" && css[i + 1] === "*") {
    const end = css.indexOf("*/", i + 2);
    return end === -1 || end + 2 > to ? to : end + 2;
  }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < to && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, to);
  }
  return -1;
}

/** The `}` that closes the `{` at `open` (the end of the text when it is missing). */
export function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const after = skip(css, i, css.length);
    if (after !== -1) {
      i = after - 1;
      continue;
    }
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

const DECL = /^(-{0,2}[a-zA-Z_][\w-]*)\s*:/;

export function scanCss(css: string): CssScan {
  const out: CssScan = { blocks: [], decls: [], imports: [] };

  const segment = (from: number, to: number, block: number, stop: number) => {
    let s = from;
    while (s < to && /\s/.test(css[s]!)) s++;
    const text = css.slice(s, to);
    if (block === -1) {
      const m = /^@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/i.exec(text);
      if (m) out.imports.push({ spec: m[2]!, start: s });
      return;
    }
    const m = DECL.exec(text);
    if (!m) return;
    let valueStart = s + m[0].length;
    while (valueStart < to && /[ \t]/.test(css[valueStart]!)) valueStart++;
    let valueEnd = to;
    while (valueEnd > valueStart && /\s/.test(css[valueEnd - 1]!)) valueEnd--;
    out.decls.push({ property: m[1]!, value: css.slice(valueStart, valueEnd), start: s, valueStart, valueEnd, end: stop, block });
  };

  const scan = (from: number, to: number, chain: CssFrame[], block: number) => {
    let seg = from;
    let paren = 0;
    let i = from;
    while (i < to) {
      const after = skip(css, i, to);
      if (after !== -1) {
        // A comment before anything else in the segment is not part of it.
        if (css[i] === "/" && css.slice(seg, i).trim() === "") seg = after;
        i = after;
        continue;
      }
      const c = css[i]!;
      if (c === "(") paren++;
      else if (c === ")") paren = Math.max(0, paren - 1);
      else if (c === ";" && paren === 0) {
        segment(seg, i, block, i + 1);
        seg = i + 1;
      } else if (c === "{" && paren === 0) {
        const close = matchingBrace(css, i);
        const prelude = normalizePrelude(css.slice(seg, i));
        const frame: CssFrame = { kind: prelude.startsWith("@") ? "at" : "rule", text: prelude };
        const index = out.blocks.length;
        let start = seg;
        while (start < i && /\s/.test(css[start]!)) start++;
        out.blocks.push({ chain: [...chain, frame], start, open: i, close });
        scan(i + 1, Math.min(close, to), [...chain, frame], index);
        i = close + 1;
        seg = i;
        continue;
      } else if (c === "}" && block === -1) {
        // A stray `}` at the top level: start over after it.
        seg = i + 1;
      }
      i++;
    }
    if (css.slice(seg, to).trim()) segment(seg, to, block, to);
  };

  scan(0, css.length, [], -1);
  return out;
}

/** `var(--a)`, `var(--b, ...)`: the custom properties a value reads, in order, each once. */
export function varRefs(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** 1-based line and column of an offset. */
export function lineCol(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    last = i;
  }
  return { line, column: offset - last };
}

/** The text of the line holding `offset`, trimmed and cut to `max` characters. */
export function lineText(text: string, offset: number, max = 160): string {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  const nl = text.indexOf("\n", offset);
  const line = text.slice(start, nl === -1 ? text.length : nl).trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
