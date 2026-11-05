import { VOID } from "@gable/core/tooling";
/**
 * A tolerant, structure-preserving parser for Gable template bodies, used only by the formatter.
 * It never throws: malformed input degrades to text. `${}` holes and `{{ }}` interpolations stay opaque.
 */

export type Item =
  | { k: "word"; text: string; space: boolean; blank: boolean }
  | { k: "comment"; text: string; blank: boolean }
  | { k: "let"; text: string; blank: boolean }
  | { k: "chain"; parts: { head: string; items: Item[] }[]; blank: boolean }
  | {
      k: "el";
      name: string;
      attrs: string[];
      selfClose: boolean;
      closed: boolean;
      raw: string | null;
      items: Item[];
      /** Whitespace between the last child and the closing tag. */
      endSpace: boolean;
      space: boolean;
      blank: boolean;
    };

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
  parseItems(inBlock: boolean, ancestors: string[]): { items: Item[]; endSpace: boolean; closedBy: string | null } {
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
      if (c === "}" && inBlock) return { items, endSpace: space, closedBy: null };
      if (c === "<") {
        if (s.startsWith("<!--", this.i)) {
          const end = s.indexOf("-->", this.i + 4);
          const stop = end === -1 ? s.length : end + 3;
          items.push({ k: "comment", text: s.slice(this.i, stop), blank: take().blank });
          this.i = stop;
          continue;
        }
        if (s[this.i + 1] === "!") {
          const end = s.indexOf(">", this.i);
          const stop = end === -1 ? s.length : end + 1;
          items.push({ k: "comment", text: s.slice(this.i, stop), blank: take().blank });
          this.i = stop;
          continue;
        }
        if (s[this.i + 1] === "/") {
          const m = /^<\/\s*([^\s>]*)\s*>/.exec(s.slice(this.i));
          if (m) {
            const name = m[1]!;
            if (ancestors.length && name.toLowerCase() === ancestors[ancestors.length - 1]!.toLowerCase()) {
              this.i += m[0].length;
              return { items, endSpace: space, closedBy: name };
            }
            if (ancestors.some((a) => a.toLowerCase() === name.toLowerCase())) {
              return { items, endSpace: space, closedBy: null };
            }
            const t = take();
            items.push({ k: "word", text: m[0], space: t.space, blank: t.blank });
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
      const word = this.readWord();
      items.push({ k: "word", text: word, space: t.space, blank: t.blank });
    }
    return { items, endSpace: space, closedBy: null };
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

  private parseElement(ancestors: string[], space: boolean, blank: boolean): Item {
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
      let attr = this.readAttrPart(false);
      let j = this.i;
      while (isWs(s[j])) j++;
      if (s[j] === "=" && !attr.includes("=")) {
        j++;
        while (isWs(s[j])) j++;
        this.i = j;
        attr += "=" + this.readAttrPart(true);
      }
      attrs.push(attr);
    }
    const lname = name.toLowerCase();
    const el: Item = { k: "el", name, attrs, selfClose, closed: true, raw: null, items: [], endSpace: false, space, blank };
    if (selfClose || VOID.has(lname)) return el;
    if (RAW.has(lname)) {
      const m = new RegExp(`</${lname}\\s*>`, "i").exec(s.slice(this.i));
      if (m) {
        el.raw = s.slice(this.i, this.i + m.index);
        this.i += m.index + m[0].length;
      } else {
        el.raw = s.slice(this.i);
        this.i = s.length;
        el.closed = false;
      }
      return el;
    }
    const r = this.parseItems(this.blockDepth > 0, [...ancestors, name]);
    el.items = r.items;
    el.endSpace = r.endSpace;
    el.closed = r.closedBy !== null;
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

  private parseBlockOrLet(ancestors: string[], blank: boolean): Item | null {
    const s = this.s;
    const startAt = this.i;
    const head = this.readBlockHead();
    if (head === null) {
      this.i = startAt;
      return null;
    }
    if (head.name === "let") return { k: "let", text: head.text, blank };
    const parts: { head: string; items: Item[] }[] = [];
    let cur = head;
    for (;;) {
      this.blockDepth++;
      const r = this.parseItems(true, ancestors);
      this.blockDepth--;
      parts.push({ head: cur.text, items: r.items });
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
          continue;
        }
        this.i = save;
      }
      break;
    }
    return { k: "chain", parts, blank };
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
