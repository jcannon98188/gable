import { VOID } from "@gable/core/tooling";
/**
 * A tolerant, structure-preserving parser for Gable template bodies: the formatter's parser, and the position authority
 * for the Designer (every item carries its source offsets, so edits can be minimal text patches).
 * It never throws: malformed input degrades to text. `${}` holes and `{{ }}` interpolations stay opaque.
 */

/** An attribute as written: its whole text and the ranges of its name and (unquoted) value, as offsets into the parsed source. */
export interface AttrInfo {
  text: string;
  start: number;
  end: number;
  name: string;
  /** Offset just after the name. */
  nameEnd: number;
  /** The value text without its quotes; both -1 when the attribute has no `=value`. */
  valueStart: number;
  valueEnd: number;
  /** `"`, `'` or empty (unquoted or no value). */
  quote: string;
}

/** Where an item sits in the parsed source: offsets into the exact string given to `parseTemplate`. */
export interface Span {
  start: number;
  end: number;
}

export type Item = (
  | { k: "word"; text: string; space: boolean; blank: boolean }
  | { k: "comment"; text: string; blank: boolean }
  | { k: "let"; text: string; blank: boolean }
  | {
      k: "chain";
      parts: {
        head: string;
        items: Item[];
        /** The block head, `@if (cond) {`, as written. */
        headStart: number;
        headEnd: number;
        /** The body: just after the `{` to the `}` (or the end of input when it is missing). */
        bodyStart: number;
        bodyEnd: number;
      }[];
      blank: boolean;
    }
  | {
      k: "el";
      name: string;
      attrs: string[];
      /** `attrs` with their source ranges. */
      attrInfo: AttrInfo[];
      selfClose: boolean;
      closed: boolean;
      raw: string | null;
      items: Item[];
      /** Whitespace between the last child and the closing tag. */
      endSpace: boolean;
      space: boolean;
      blank: boolean;
      /** Offset just after the opening tag's `>`. */
      openEnd: number;
      /** Offset of the closing tag's `</`, or -1 when there is none (void, self-closing, unclosed). */
      closeStart: number;
      /** Offset just after the tag name. */
      nameEnd: number;
    }
) &
  Span;

const RAW = new Set(["pre", "textarea", "script", "style"]);
const BLOCK_KW = /^@(?:if|else|for|empty|switch|case|default|let|defer|placeholder|loading|error)(?![\w$])/;

/** Index just past a `${...}` hole starting at `i` (which points at `$`). */
export function skipHole(s: string, i: number): number {
  let depth = 0;
  let j = i + 1;
  for (; j < s.length; j++) {
    const c = s[j]!;
    if (c === "\\") j++;
    else if (c === '"' || c === "'") j = skipQuote(s, j);
    else if (c === "`") j = skipTemplate(s, j);
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return j + 1;
  }
  return s.length;
}

function skipQuote(s: string, i: number): number {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") j++;
    else if (s[j] === q) return j;
  }
  return s.length;
}

function skipTemplate(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") j++;
    else if (s[j] === "`") return j;
    else if (s[j] === "$" && s[j + 1] === "{") j = skipHole(s, j) - 1;
  }
  return s.length;
}

const isWs = (c: string | undefined) => c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";

class Parser {
  i = 0;
  constructor(private s: string) {}

  /** Parses items until EOF, a stray `}` (when inBlock), or a closing tag for an ancestor. */
  parseItems(inBlock: boolean, ancestors: string[]): { items: Item[]; endSpace: boolean; closedBy: string | null; closeAt: number } {
    const s = this.s;
    const items: Item[] = [];
    let space = false;
    let nl = 0;
    const take = (): { space: boolean; blank: boolean } => {
      const r = { space, blank: nl >= 2 && items.length > 0 };
      space = false;
      nl = 0;
      return r;
    };
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (isWs(c)) {
        space = true;
        if (c === "\n") nl++;
        this.i++;
        continue;
      }
      if (c === "}" && inBlock) return { items, endSpace: space, closedBy: null, closeAt: -1 };
      if (c === "<") {
        if (s.startsWith("<!--", this.i)) {
          const end = s.indexOf("-->", this.i + 4);
          const stop = end === -1 ? s.length : end + 3;
          items.push({ k: "comment", text: s.slice(this.i, stop), blank: take().blank, start: this.i, end: stop });
          this.i = stop;
          continue;
        }
        if (s[this.i + 1] === "!") {
          const end = s.indexOf(">", this.i);
          const stop = end === -1 ? s.length : end + 1;
          items.push({ k: "comment", text: s.slice(this.i, stop), blank: take().blank, start: this.i, end: stop });
          this.i = stop;
          continue;
        }
        if (s[this.i + 1] === "/") {
          const m = /^<\/\s*([^\s>]*)\s*>/.exec(s.slice(this.i));
          if (m) {
            const name = m[1]!;
            if (ancestors.length && name.toLowerCase() === ancestors[ancestors.length - 1]!.toLowerCase()) {
              const closeAt = this.i;
              this.i += m[0].length;
              return { items, endSpace: space, closedBy: name, closeAt };
            }
            if (ancestors.some((a) => a.toLowerCase() === name.toLowerCase())) {
              return { items, endSpace: space, closedBy: null, closeAt: -1 };
            }
            const t = take();
            items.push({ k: "word", text: m[0], space: t.space, blank: t.blank, start: this.i, end: this.i + m[0].length });
            this.i += m[0].length;
            continue;
          }
        }
        if (/[A-Za-z$]/.test(s[this.i + 1] ?? "")) {
          const t = take();
          items.push(this.parseElement(ancestors, t.space, t.blank));
          continue;
        }
      }
      if (c === "@" && BLOCK_KW.test(s.slice(this.i, this.i + 16)) && !/[\w$.]/.test(s[this.i - 1] ?? " ")) {
        const t = take();
        const parsed = this.parseBlockOrLet(ancestors, t.blank);
        if (parsed) {
          items.push(parsed);
          continue;
        }
      }
      // Text: one word (no whitespace), glued to the previous item unless whitespace preceded it.
      const t = take();
      const wordStart = this.i;
      const word = this.readWord();
      items.push({ k: "word", text: word, space: t.space, blank: t.blank, start: wordStart, end: this.i });
    }
    return { items, endSpace: space, closedBy: null, closeAt: -1 };
  }

  /** Reads text up to whitespace or a construct boundary (`<tag`, block keyword, `}`), keeping `${}` and `{{}}` whole. */
  private readWord(): string {
    const s = this.s;
    const start = this.i;
    let out = "";
    let first = true;
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (isWs(c)) break;
      if (!first) {
        if (c === "<" && (/[A-Za-z$/!]/.test(s[this.i + 1] ?? ""))) break;
        if (c === "@" && BLOCK_KW.test(s.slice(this.i, this.i + 16)) && !/[\w$.]/.test(s[this.i - 1] ?? " ")) break;
        if (c === "}" && this.blockDepth > 0) break;
      }
      first = false;
      if (c === "\\") {
        out += s.slice(this.i, this.i + 2);
        this.i += 2;
      } else if (c === "$" && s[this.i + 1] === "{") {
        const end = skipHole(s, this.i);
        out += s.slice(this.i, end);
        this.i = end;
      } else if (c === "{" && s[this.i + 1] === "{") {
        const close = s.indexOf("}}", this.i + 2);
        if (close === -1) {
          out += s.slice(this.i);
          this.i = s.length;
        } else {
          out += "{{ " + s.slice(this.i + 2, close).trim() + " }}";
          this.i = close + 2;
        }
      } else {
        out += c;
        this.i++;
      }
    }
    if (this.i === start) {
      // A lone boundary character that must still be consumed to guarantee progress.
      out = s[this.i]!;
      this.i++;
    }
    return out;
  }

  blockDepth = 0;

  private parseElement(ancestors: string[], space: boolean, blank: boolean): Extract<Item, { k: "el" }> {
    const s = this.s;
    this.i++; // <
    let name = "";
    while (this.i < s.length && !isWs(s[this.i]) && s[this.i] !== ">" && !(s[this.i] === "/" && s[this.i + 1] === ">")) {
      if (s[this.i] === "$" && s[this.i + 1] === "{") {
        const end = skipHole(s, this.i);
        name += s.slice(this.i, end);
        this.i = end;
      } else name += s[this.i++];
    }
    const attrs: string[] = [];
    const attrInfo: AttrInfo[] = [];
    const nameEnd = this.i;
    const elStart = nameEnd - name.length - 1;
    let selfClose = false;
    for (;;) {
      while (isWs(s[this.i])) this.i++;
      if (this.i >= s.length) break;
      if (s[this.i] === ">") {
        this.i++;
        break;
      }
      if (s[this.i] === "/" && s[this.i + 1] === ">") {
        selfClose = true;
        this.i += 2;
        break;
      }
      const attrStart = this.i;
      let attr = this.readAttrPart(false);
      const attrNameEnd = this.i;
      let valueStart = -1;
      let valueEnd = -1;
      let quote = "";
      let j = this.i;
      while (isWs(s[j])) j++;
      if (s[j] === "=" && !attr.includes("=")) {
        j++;
        while (isWs(s[j])) j++;
        this.i = j;
        const from = this.i;
        const part = this.readAttrPart(true);
        attr += "=" + part;
        if (part[0] === '"' || part[0] === "'") {
          quote = part[0];
          valueStart = from + 1;
          valueEnd = part.length > 1 && part.endsWith(quote) ? this.i - 1 : this.i;
        } else {
          valueStart = from;
          valueEnd = this.i;
        }
      }
      attrs.push(attr);
      attrInfo.push({ text: attr, start: attrStart, end: this.i, name: s.slice(attrStart, attrNameEnd), nameEnd: attrNameEnd, valueStart, valueEnd, quote });
    }
    const lname = name.toLowerCase();
    const el: Extract<Item, { k: "el" }> = {
      k: "el", name, attrs, attrInfo, selfClose, closed: true, raw: null, items: [], endSpace: false, space, blank,
      start: elStart, end: this.i, openEnd: this.i, closeStart: -1, nameEnd,
    };
    if (selfClose || VOID.has(lname)) return el;
    if (RAW.has(lname)) {
      const m = new RegExp(`</${lname}\\s*>`, "i").exec(s.slice(this.i));
      if (m) {
        el.raw = s.slice(this.i, this.i + m.index);
        el.closeStart = this.i + m.index;
        this.i += m.index + m[0].length;
      } else {
        el.raw = s.slice(this.i);
        this.i = s.length;
        el.closed = false;
      }
      el.end = this.i;
      return el;
    }
    const r = this.parseItems(this.blockDepth > 0, [...ancestors, name]);
    el.items = r.items;
    el.endSpace = r.endSpace;
    el.closed = r.closedBy !== null;
    el.closeStart = r.closeAt;
    el.end = this.i;
    return el;
  }

  private readAttrPart(isValue: boolean): string {
    const s = this.s;
    let out = "";
    if (isValue && (s[this.i] === '"' || s[this.i] === "'")) {
      const q = s[this.i]!;
      let j = this.i + 1;
      for (; j < s.length && s[j] !== q; j++) {
        if (s[j] === "$" && s[j + 1] === "{") j = skipHole(s, j) - 1;
      }
      const text = s.slice(this.i, j + 1);
      this.i = j + 1;
      return text;
    }
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (isWs(c) || c === ">" || (c === "/" && s[this.i + 1] === ">")) break;
      if (c === "=" && !isValue && out.length > 0) break;
      if (c === "$" && s[this.i + 1] === "{") {
        const end = skipHole(s, this.i);
        out += s.slice(this.i, end);
        this.i = end;
        continue;
      }
      out += c;
      this.i++;
    }
    return out;
  }

  private balanced(open: number): number {
    // index of the ")" matching s[open] === "(", or -1
    const s = this.s;
    let depth = 0;
    for (let j = open; j < s.length; j++) {
      const c = s[j]!;
      if (c === '"' || c === "'") j = skipQuote(s, j);
      else if (c === "`") j = skipTemplate(s, j);
      else if (c === "$" && s[j + 1] === "{") j = skipHole(s, j) - 1;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return j;
    }
    return -1;
  }

  private parseBlockOrLet(ancestors: string[], blank: boolean): Extract<Item, { k: "chain" | "let" }> | null {
    const s = this.s;
    const startAt = this.i;
    const head = this.readBlockHead();
    if (head === null) {
      this.i = startAt;
      return null;
    }
    if (head.name === "let") return { k: "let", text: head.text, blank, start: startAt, end: this.i };
    const parts: Extract<Item, { k: "chain" }>["parts"] = [];
    let cur = head;
    let headStart = startAt;
    let headEnd = this.i;
    for (;;) {
      const bodyStart = this.i;
      this.blockDepth++;
      const r = this.parseItems(true, ancestors);
      this.blockDepth--;
      parts.push({ head: cur.text, items: r.items, headStart, headEnd, bodyStart, bodyEnd: this.i });
      if (s[this.i] === "}") this.i++;
      // Chain continuation.
      let j = this.i;
      while (isWs(s[j])) j++;
      const nextName = cur.name === "if" || cur.name === "else if" ? /^@else(?![\w$])/ : cur.name === "for" ? /^@empty(?![\w$])/ : null;
      if (nextName && nextName.test(s.slice(j, j + 8))) {
        const save = this.i;
        this.i = j;
        const next = this.readBlockHead();
        if (next && (next.name === "else" || next.name === "else if" || next.name === "empty")) {
          if (cur.name === "else" || cur.name === "empty") {
            this.i = save;
            break;
          }
          cur = next;
          headStart = j;
          headEnd = this.i;
          continue;
        }
        this.i = save;
      }
      break;
    }
    return { k: "chain", parts, blank, start: startAt, end: this.i };
  }

  /** Reads `@name (args) {` (or `@let ...;`), normalising spacing. Null (position unspecified) when malformed. */
  private readBlockHead(): { name: string; text: string } | null {
    const s = this.s;
    const m = /^@(\w+)/.exec(s.slice(this.i, this.i + 40));
    if (!m) return null;
    let name = m[1]!;
    let j = this.i + m[0].length;
    if (name === "let") {
      let k = j;
      for (; k < s.length; k++) {
        const c = s[k]!;
        if (c === '"' || c === "'") k = skipQuote(s, k);
        else if (c === "`") k = skipTemplate(s, k);
        else if (c === "$" && s[k + 1] === "{") k = skipHole(s, k) - 1;
        else if (c === ";") break;
      }
      if (k >= s.length) return null;
      const body = s.slice(j, k).trim();
      const lm = /^([^=\s]+)\s*=\s*([\s\S]*)$/.exec(body);
      if (!lm) return null;
      this.i = k + 1;
      return { name, text: `@let ${lm[1]} = ${lm[2]};` };
    }
    while (isWs(s[j])) j++;
    if (name === "else" && /^if(?![\w$])/.test(s.slice(j, j + 3))) {
      name = "else if";
      j += 2;
      while (isWs(s[j])) j++;
    }
    let args: string | null = null;
    if (s[j] === "(") {
      const close = this.balanced(j);
      if (close === -1) return null;
      args = s.slice(j + 1, close).trim();
      j = close + 1;
      while (isWs(s[j])) j++;
    }
    if (s[j] !== "{") return null;
    this.i = j + 1;
    if (args !== null && name === "for") args = splitTop(args, ";").map((p) => p.trim()).join("; ");
    return { name, text: args === null ? `@${name} {` : `@${name} (${args}) {` };
  }
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j]!;
    if (c === '"' || c === "'") j = skipQuote(s, j);
    else if (c === "`") j = skipTemplate(s, j);
    else if (c === "$" && s[j + 1] === "{") j = skipHole(s, j) - 1;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(from, j));
      from = j + 1;
    }
  }
  out.push(s.slice(from));
  return out;
}

export function parseTemplate(source: string): Item[] {
  return new Parser(source).parseItems(false, []).items;
}
