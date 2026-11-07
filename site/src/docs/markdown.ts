// A small, safe markdown parser for the docs. It produces plain data (blocks of text segments) that components render
// through templates, so there is no HTML string anywhere: raw HTML in the source is just text, and links with a scheme
// other than http(s) and mailto are dropped to plain text.
//
// Supported: headings, paragraphs, fenced code, bullet and numbered lists (one nested level), tables, block quotes,
// rules, and the inline forms `code`, **bold**, *italic*, [text](href) and backslash escapes. Not supported on purpose:
// raw HTML, images, reference links, footnotes. Whole-line HTML comments are skipped.

/** A run of inline text. `href` is set for links; `internal` says the link is a docs route (router navigation). */
export interface Inline {
  key: number;
  text: string;
  code: boolean;
  bold: boolean;
  italic: boolean;
  href: string | null;
  internal: boolean;
  /** CSS class for the run: `code`, `b`, `i`, in combination. Empty for plain text. */
  cls: string;
}

export interface ListItem {
  key: number;
  inlines: Inline[];
  /** One nested level; deeper lists are flattened into it. */
  sub: ListItem[];
}

export type Align = "left" | "center" | "right" | "";
export interface TableCell {
  key: number;
  inlines: Inline[];
  align: Align;
}
export interface TableRow {
  key: number;
  cells: TableCell[];
}

export interface Block {
  key: number;
  kind: "h1" | "h2" | "h3" | "h4" | "p" | "code" | "ul" | "ol" | "table" | "quote" | "hr";
  /** Headings: the anchor id. */
  id: string;
  /** Headings: `#id`, for the permalink. */
  anchor: string;
  /** Headings: the plain text. */
  text: string;
  inlines: Inline[];
  /** Fenced code. */
  lang: string;
  code: string;
  items: ListItem[];
  head: TableCell[];
  rows: TableRow[];
}

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface MarkdownOptions {
  /** Maps a link target to a docs route (or an external URL). `internal` makes it a router link. */
  resolveLink?: (href: string) => { href: string; internal: boolean } | null;
}

export interface MarkdownDoc {
  blocks: Block[];
  toc: TocItem[];
  /** The text of the first `h1`, or "". */
  title: string;
}

/** GitHub-style anchor id: lowercase, punctuation removed, spaces to dashes. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-") || "section"
  );
}

const SAFE_SCHEME = /^(https?:|mailto:)/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

class Keys {
  n = 0;
  next() {
    return this.n++;
  }
}

interface State {
  code?: boolean;
  bold: boolean;
  italic: boolean;
  href: string | null;
  internal: boolean;
}

function run(text: string, state: State, keys: Keys): Inline {
  const cls = [state.code ? "code" : "", state.bold ? "b" : "", state.italic ? "i" : ""].filter(Boolean).join(" ");
  return { key: keys.next(), text, code: !!state.code, bold: state.bold, italic: state.italic, href: state.href, internal: state.internal, cls };
}

/** Finds the `]` that closes the `[` at `start`, skipping code spans and nested brackets. */
function closeBracket(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") i++;
    else if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > 0) i = end;
    } else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}

export function parseInline(src: string, options: MarkdownOptions = {}, keys: Keys = new Keys()): Inline[] {
  const out: Inline[] = [];
  const walk = (s: string, state: State) => {
    let buf = "";
    const flush = () => {
      if (buf) out.push(run(buf, state, keys));
      buf = "";
    };
    let i = 0;
    while (i < s.length) {
      const c = s[i]!;
      if (c === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|<>~]/.test(s[i + 1]!)) {
        buf += s[i + 1];
        i += 2;
      } else if (c === "`") {
        const end = s.indexOf("`", i + 1);
        if (end < 0) {
          buf += c;
          i++;
        } else {
          flush();
          out.push(run(s.slice(i + 1, end), { ...state, code: true }, keys));
          i = end + 1;
        }
      } else if (c === "[") {
        const close = closeBracket(s, i);
        const m = close > 0 ? /^\(([^)\s]*)(?:\s+"[^"]*")?\)/.exec(s.slice(close + 1)) : null;
        if (!m) {
          buf += c;
          i++;
          continue;
        }
        const target = m[1]!;
        const label = s.slice(i + 1, close);
        flush();
        const resolved = options.resolveLink?.(target) ?? { href: target, internal: false };
        // Only http(s), mailto and scheme-less (relative or fragment) targets become links.
        if (SAFE_SCHEME.test(resolved.href) || !ANY_SCHEME.test(resolved.href)) walk(label, { ...state, href: resolved.href, internal: resolved.internal });
        else walk(label, state);
        i = close + 1 + m[0].length;
      } else if ((c === "*" || c === "_") && s[i + 1] === c) {
        const end = s.indexOf(c + c, i + 2);
        if (end > i + 2 && (c === "*" || /\W/.test(s[i - 1] ?? " "))) {
          flush();
          walk(s.slice(i + 2, end), { ...state, bold: true });
          i = end + 2;
        } else {
          buf += c + c;
          i += 2;
        }
      } else if (c === "*" || (c === "_" && /\W/.test(s[i - 1] ?? " "))) {
        const end = s.indexOf(c, i + 1);
        if (end > i + 1 && s[i + 1] !== " " && (c === "*" || /\W/.test(s[end + 1] ?? " "))) {
          flush();
          walk(s.slice(i + 1, end), { ...state, italic: true });
          i = end + 1;
        } else {
          buf += c;
          i++;
        }
      } else {
        buf += c;
        i++;
      }
    }
    flush();
  };
  walk(src, { bold: false, italic: false, href: null, internal: false });
  return out;
}

const plain = (inlines: readonly Inline[]) => inlines.map((i) => i.text).join("");

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^(#{1,4})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      const stop = end < 0 ? s.length - 1 : end;
      cur += s.slice(i, stop + 1);
      i = stop;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

const alignOf = (c: string): Align => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "");

export function parseMarkdown(source: string, options: MarkdownOptions = {}): MarkdownDoc {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const keys = new Keys();
  const blocks: Block[] = [];
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  let title = "";

  const push = (b: Partial<Block> & Pick<Block, "kind">) =>
    blocks.push({ key: blocks.length, id: "", anchor: "", text: "", inlines: [], lang: "", code: "", items: [], head: [], rows: [], ...b });
  const inline = (s: string) => parseInline(s, options, keys);
  const startsBlock = (n: number) =>
    FENCE.test(lines[n]!) || HEADING.test(lines[n]!) || BULLET.test(lines[n]!) || ORDERED.test(lines[n]!) || QUOTE.test(lines[n]!) || (lines[n]!.includes("|") && n + 1 < lines.length && TABLE_SEP.test(lines[n + 1]!));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1]!;
      const closer = new RegExp(`^\\s{0,3}${mark[0]}{${mark.length},}\\s*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length && !closer.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      push({ kind: "code", lang: fence[2] ?? "", code: body.join("\n") });
      continue;
    }
    if (/^\s*<!--.*-->\s*$/.test(line)) {
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const inlines = inline(heading[2]!);
      const text = plain(inlines);
      const base = slugify(text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      if (level === 1 && !title) title = text;
      if (level === 2 || level === 3) toc.push({ id, text, level: level as 2 | 3 });
      push({ kind: `h${level}` as Block["kind"], id, anchor: "#" + id, text, inlines });
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]!).map(alignOf);
      i += 2;
      const rows: TableRow[] = [];
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) {
        const cells = splitRow(lines[i++]!);
        rows.push({ key: rows.length, cells: head.map((_, c) => ({ key: c, inlines: inline(cells[c] ?? ""), align: aligns[c] ?? "" })) });
      }
      push({ kind: "table", head: head.map((h, c) => ({ key: c, inlines: inline(h), align: aligns[c] ?? "" })), rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s{0,3}>\s?/, ""));
      push({ kind: "quote", inlines: inline(body.join(" ")) });
      continue;
    }
    const first = BULLET.exec(line) ?? ORDERED.exec(line);
    if (first) {
      const ordered = !BULLET.test(line);
      const items: ListItem[] = [];
      const base = first[1]!.length;
      while (i < lines.length) {
        const cur = lines[i]!;
        const m = BULLET.exec(cur) ?? ORDERED.exec(cur);
        if (m) {
          const item: ListItem = { key: 0, inlines: inline(m[3]!), sub: [] };
          if (m[1]!.length >= base + 2 && items.length) {
            const parent = items[items.length - 1]!;
            item.key = parent.sub.length;
            parent.sub.push(item);
          } else {
            item.key = items.length;
            items.push(item);
          }
          i++;
        } else if (cur.trim() && /^\s{2,}\S/.test(cur) && items.length) {
          // A continuation line belongs to the last item.
          const last = items[items.length - 1]!;
          const target = last.sub.length ? last.sub[last.sub.length - 1]! : last;
          target.inlines = [...target.inlines, ...inline(" " + cur.trim())];
          i++;
        } else break;
      }
      push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    // Paragraph: lines up to a blank line or the start of another block.
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && lines[i]!.trim() && !startsBlock(i)) para.push(lines[i++]!.trim());
    push({ kind: "p", inlines: inline(para.join(" ")) });
  }
  return { blocks, toc, title };
}

/** Plain text of a document, for search. */
export function markdownText(doc: MarkdownDoc): string {
  const parts: string[] = [];
  for (const b of doc.blocks) {
    if (b.kind === "code" || b.kind === "hr") continue;
    if (b.kind === "ul" || b.kind === "ol") for (const it of b.items) parts.push(plain(it.inlines), ...it.sub.map((s) => plain(s.inlines)));
    else if (b.kind === "table") for (const r of b.rows) parts.push(...r.cells.map((c) => plain(c.inlines)));
    else parts.push(b.text || plain(b.inlines));
  }
  return parts.join(" ");
}
