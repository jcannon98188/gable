// An offset-aware scanner for Gable template syntax. It mirrors the structure of
// the runtime parser in @gable/core but keeps source positions, which the runtime
// has no use for. Expression grammar is NOT handled here: every expression is
// returned as a `Src` and validated by @gable/core/tooling's parser.

/** An expression's trimmed text and its absolute offset in the source file. */
export interface Src {
  text: string;
  start: number;
}
export type ExprKind = "value" | "handler" | "model";
export interface Expression extends Src {
  kind: ExprKind;
  /** The binding's name without brackets or parentheses (`value` in `[(value)]`), and its offset. */
  name: string;
  nameStart: number;
}

export interface ElementNode {
  type: "element";
  tag: string;
  expressions: Expression[];
  refs: string[];
  children: TNode[];
}
export interface IfNode {
  type: "if";
  branches: Array<{ cond: Src | null; alias?: string; children: TNode[] }>;
}
export interface ForNode {
  type: "for";
  item: string;
  source: Src;
  track: Src;
  children: TNode[];
  empty?: TNode[];
}
export interface SwitchNode {
  type: "switch";
  expr: Src;
  cases: Array<{ expr: Src | null; children: TNode[] }>;
}
export interface LetNode {
  type: "let";
  name: string;
  expr: Src;
}
export interface TextNode {
  type: "text";
  exprs: Src[];
}
export type TNode = ElementNode | IfNode | ForNode | SwitchNode | LetNode | TextNode;

export class ScanError extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly length = 1,
  ) {
    super(message);
  }
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ATTR = /\s*([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/dy;
const BLOCK_START = /^@(?:if|else|for|empty|switch|case|default|let|defer|placeholder|loading|error)\b/;
const IDENT = "[A-Za-z_$][\\w$]*";

/** Scans `text` (the template body, `${}` holes blanked) whose first character sits at `base` in the file. */
export function scanTemplate(text: string, base: number): TNode[] {
  return new Scanner(text, base).parseChildren("root");
}

function src(text: string, start: number): Src {
  const lead = text.length - text.trimStart().length;
  return { text: text.trim(), start: start + lead };
}

function topLevelIndex(source: string, char: string, from = 0): number {
  let depth = 0;
  let quote = "";
  for (let p = from; p < source.length; p++) {
    const c = source[p]!;
    if (quote) {
      if (c === "\\") p++;
      else if (c === quote) quote = "";
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === char && depth === 0) return p;
  }
  return -1;
}

/** Splits at top-level `char`, keeping each piece's offset into `source`. */
function splitTopLevel(source: string, char: string): Array<{ text: string; at: number }> {
  const out: Array<{ text: string; at: number }> = [];
  let from = 0;
  for (;;) {
    const i = topLevelIndex(source, char, from);
    if (i === -1) return [...out, { text: source.slice(from), at: from }];
    out.push({ text: source.slice(from, i), at: from });
    from = i + 1;
  }
}

class Scanner {
  i = 0;
  constructor(
    readonly source: string,
    readonly base: number,
  ) {}

  private err(message: string, at = this.i, length = 1): never {
    throw new ScanError(message, this.base + at, length);
  }

  parseChildren(context: "root" | "element" | "block", tag = ""): TNode[] {
    const out: TNode[] = [];
    const s = this.source;
    const pushText = (from: number, to: number) => {
      const raw = s.slice(from, to);
      if (raw === "" || (/^\s*$/.test(raw) && raw.includes("\n"))) return;
      const exprs: Src[] = [];
      for (let i = 0; ; ) {
        const open = raw.indexOf("{{", i);
        if (open === -1) break;
        const close = raw.indexOf("}}", open);
        if (close === -1) this.err("Unterminated {{ in template", from + open, 2);
        exprs.push(src(raw.slice(open + 2, close), this.base + from + open + 2));
        i = close + 2;
      }
      if (exprs.length) out.push({ type: "text", exprs });
    };
    while (this.i < s.length) {
      const text = this.scanText(context === "block");
      pushText(this.i, text.end);
      this.i = text.end;
      if (text.closeBlock) {
        this.i++;
        return out;
      }
      if (this.i >= s.length) break;
      const at = this.i;
      if (s[at] === "@") out.push(this.parseBlock());
      else if (s.startsWith("<!--", at)) {
        const end = s.indexOf("-->", at);
        if (end === -1) this.err("Unterminated comment in template", at, 4);
        this.i = end + 3;
      } else if (s[at + 1] === "/") {
        const end = s.indexOf(">", at);
        const name = s.slice(at + 2, end).trim();
        if (context !== "element" || tag !== name) this.err(`Unexpected </${name}> in template`, at, end - at + 1);
        this.i = end + 1;
        return out;
      } else out.push(this.parseElement(at));
    }
    if (context === "element") this.err(`Unclosed <${tag}> in template`, this.i - 1);
    if (context === "block") this.err("Unclosed block ({) in template", this.i - 1);
    return out;
  }

  private scanText(inBlock: boolean): { end: number; closeBlock: boolean } {
    const s = this.source;
    let p = this.i;
    while (p < s.length) {
      const c = s[p];
      if (c === "<") return { end: p, closeBlock: false };
      if (c === "@" && BLOCK_START.test(s.slice(p, p + 12)) && !/[\w.]/.test(s[p - 1] ?? " ")) return { end: p, closeBlock: false };
      if (c === "{" && s[p + 1] === "{") {
        const close = s.indexOf("}}", p);
        if (close === -1) this.err("Unterminated {{ in template", p, 2);
        p = close + 2;
        continue;
      }
      if (c === "}" && inBlock) return { end: p, closeBlock: true };
      p++;
    }
    return { end: p, closeBlock: false };
  }

  private skipSpace(): void {
    while (/\s/.test(this.source[this.i] ?? "")) this.i++;
  }

  /** Reads a balanced `( ... )` header; returns its inner text and offset. */
  private readHeader(block: string): { text: string; at: number } {
    this.skipSpace();
    const s = this.source;
    if (s[this.i] !== "(") this.err(`@${block} must be followed by (...)`);
    let depth = 0;
    let quote = "";
    for (let p = this.i; p < s.length; p++) {
      const c = s[p]!;
      if (quote) {
        if (c === "\\") p++;
        else if (c === quote) quote = "";
      } else if (c === "'" || c === '"') quote = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) {
        const at = this.i + 1;
        this.i = p + 1;
        return { text: s.slice(at, p), at };
      }
    }
    return this.err(`Unterminated (...) after @${block}`);
  }

  private readBody(block: string): TNode[] {
    this.skipSpace();
    if (this.source[this.i] !== "{") this.err(`@${block} must be followed by a { ... } block`);
    this.i++;
    return this.parseChildren("block");
  }

  private eat(word: string): boolean {
    const save = this.i;
    this.skipSpace();
    if (this.source.startsWith("@" + word, this.i) && !/[\w$]/.test(this.source[this.i + word.length + 1] ?? "")) {
      this.i += word.length + 1;
      return true;
    }
    this.i = save;
    return false;
  }

  private abs(header: { text: string; at: number }): Src {
    return src(header.text, this.base + header.at);
  }

  private parseBlock(): TNode {
    const s = this.source;
    const blockAt = this.i;
    const name = /^@(\w+)/.exec(s.slice(this.i))![1]!;
    this.i += name.length + 1;
    switch (name) {
      case "let": {
        const end = topLevelIndex(s, ";", this.i);
        if (end === -1) this.err("@let must end with ;", blockAt, 4);
        const body = s.slice(this.i, end);
        const m = new RegExp(`^(\\s*(${IDENT})\\s*=)([\\s\\S]*)$`).exec(body);
        if (!m) this.err("@let must look like: @let name = expression;", blockAt, 4);
        const expr = src(m[3]!, this.base + this.i + m[1]!.length);
        this.i = end + 1;
        return { type: "let", name: m[2]!, expr };
      }
      case "if": {
        const branches: IfNode["branches"] = [];
        let header = this.readHeader("if");
        for (;;) {
          const parts = splitTopLevel(header.text, ";");
          let alias: string | undefined;
          if (parts[1]) {
            const m = new RegExp(`^\\s*as\\s+(${IDENT})\\s*$`).exec(parts[1].text);
            if (!m || parts.length > 2) this.err(`Expected "; as name" after the condition in "${header.text.trim()}"`, header.at, header.text.length);
            alias = m[1];
          }
          branches.push({ cond: src(parts[0]!.text, this.base + header.at), alias, children: this.readBody("if") });
          if (!this.eat("else")) break;
          this.skipSpace();
          if (/^if\b/.test(s.slice(this.i))) {
            this.i += 2;
            header = this.readHeader("else if");
          } else {
            branches.push({ cond: null, children: this.readBody("else") });
            break;
          }
        }
        return { type: "if", branches };
      }
      case "for": {
        const header = this.readHeader("for");
        const parts = splitTopLevel(header.text, ";");
        const m = new RegExp(`^(\\s*(${IDENT})\\s+of\\s+)([\\s\\S]+)$`).exec(parts[0]!.text);
        if (!m) this.err("@for must look like: @for (item of items(); track item.id)", blockAt, 4);
        const trackPart = parts.slice(1).find((p) => /^\s*track\s/.test(p.text));
        if (!trackPart) this.err(`@for (${parts[0]!.text.trim()}) needs a track expression, e.g. track ${m[2]}.id`, blockAt, 4);
        const trackLead = /^\s*track\s/.exec(trackPart.text)![0].length;
        const children = this.readBody("for");
        const empty = this.eat("empty") ? this.readBody("empty") : undefined;
        return {
          type: "for",
          item: m[2]!,
          source: src(m[3]!, this.base + header.at + m[1]!.length),
          track: src(trackPart.text.slice(trackLead), this.base + header.at + trackPart.at + trackLead),
          children,
          empty,
        };
      }
      case "switch": {
        const expr = this.abs(this.readHeader("switch"));
        this.skipSpace();
        if (s[this.i] !== "{") this.err("@switch must be followed by a { ... } block");
        this.i++;
        const cases: SwitchNode["cases"] = [];
        for (;;) {
          this.skipSpace();
          if (s[this.i] === "}") {
            this.i++;
            return { type: "switch", expr, cases };
          }
          if (this.eat("case")) {
            const header = this.abs(this.readHeader("case"));
            cases.push({ expr: header, children: this.readBody("case") });
          } else if (this.eat("default")) cases.push({ expr: null, children: this.readBody("default") });
          else this.err("@switch may only contain @case and @default blocks");
        }
      }
      case "defer":
        return this.err("@defer is not supported yet", blockAt, 6);
      default:
        return this.err(`Unexpected @${name} in template (it must follow an @if, @for or @switch block)`, blockAt, name.length + 1);
    }
  }

  private parseElement(lt: number): ElementNode {
    const s = this.source;
    const nameMatch = /^<([A-Za-z][\w-]*)/.exec(s.slice(lt));
    if (!nameMatch) this.err(`Unexpected "<" in template`, lt);
    const tag = nameMatch[1]!;
    const el: ElementNode = { type: "element", tag, expressions: [], refs: [], children: [] };
    let p = lt + nameMatch[0].length;
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(s[p] ?? "")) p++;
      if (p >= s.length) this.err(`Unterminated <${tag}> in template`, lt, tag.length + 1);
      if (s[p] === ">") {
        p++;
        break;
      }
      if (s.startsWith("/>", p)) {
        selfClosing = true;
        p += 2;
        break;
      }
      ATTR.lastIndex = p;
      const m = ATTR.exec(s);
      if (!m) this.err(`Bad attribute in <${tag}>`, p);
      const nameAt = m.indices![1]![0];
      p = ATTR.lastIndex;
      const name = m[1]!;
      const valueRange = m.indices![2] ?? m.indices![3];
      const value = m[2] ?? m[3] ?? "";
      const valueAt = valueRange ? valueRange[0] : p;
      const expr = (kind: ExprKind, open: number): Expression => ({
        kind,
        name: name.slice(open, name.length - open),
        nameStart: this.base + nameAt + open,
        ...src(value, this.base + valueAt),
      });
      if (name.startsWith("[(") && name.endsWith(")]")) el.expressions.push(expr("model", 2));
      else if (name.startsWith("[") && name.endsWith("]")) el.expressions.push(expr("value", 1));
      else if (name.startsWith("(") && name.endsWith(")")) el.expressions.push(expr("handler", 1));
      else if (name.startsWith("#")) el.refs.push(name.slice(1));
      else if (name.startsWith("*")) this.err(`Structural directives ("${name}") do not exist; use @if or @for blocks.`, nameAt, name.length);
      else if (value.includes("{{")) this.err(`Interpolation in attribute "${name}" is not supported; use [attr.${name}] or [${name}].`, valueAt, value.length);
    }
    this.i = p;
    if (!selfClosing && !VOID.has(tag)) el.children = this.parseChildren("element", tag);
    return el;
  }
}
