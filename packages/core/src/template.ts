import { parseExpression, parseHandler, type Expr, type HandlerExpr } from "./expression.js";

export type BindingKind = "prop" | "attr" | "class" | "style";

export interface ElementNode {
  type: "element";
  tag: string;
  attrs: Array<{ name: string; value: string }>;
  bindings: Array<{ kind: BindingKind; name: string; expr: Expr }>;
  events: Array<{ name: string; handler: HandlerExpr }>;
  /** Two-way `[(name)]="signal"` bindings. */
  models: Array<{ name: string; expr: Expr }>;
  /** `#name` template refs. */
  refs: string[];
  children: TemplateNode[];
}

export type TemplateNode = ElementNode | { type: "text"; parts: Array<string | Expr> };

/** The result of the `html` tag: the call site's static strings plus its `${}` values. */
export interface TemplateResult {
  readonly strings: TemplateStringsArray;
  readonly values: readonly unknown[];
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): TemplateResult {
  return { strings, values };
}

const cache = new WeakMap<TemplateStringsArray, TemplateNode[]>();

/** Parses once per call site (strings-array identity), lazily on first render. */
export function parseTemplate(result: TemplateResult): TemplateNode[] {
  let parsed = cache.get(result.strings);
  if (!parsed) {
    if (result.values.length > 0) throw new Error("html`` holes (${}) are not supported yet");
    parsed = new Parser(result.strings[0]!).parseChildren("root");
    cache.set(result.strings, parsed);
  }
  return parsed;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ATTR = /\s*([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;

class Parser {
  i = 0;
  constructor(readonly source: string) {}

  /** Parses nodes until the end of the enclosing element (`</tag>`, consumed), block (`}`, consumed) or the source. */
  parseChildren(context: "root" | "element" | "block", tag = ""): TemplateNode[] {
    const out: TemplateNode[] = [];
    const src = this.source;
    const pushText = (raw: string) => {
      if (raw === "" || (/^\s*$/.test(raw) && raw.includes("\n"))) return;
      out.push({ type: "text", parts: parseInterpolation(raw) });
    };
    while (this.i < src.length) {
      const text = this.scanText(context === "block");
      pushText(src.slice(this.i, text.end));
      this.i = text.end;
      if (text.closeBlock) {
        this.i++;
        return out;
      }
      if (this.i >= src.length) break;
      const at = this.i;
      if (src.startsWith("<!--", at)) {
        const end = src.indexOf("-->", at);
        if (end === -1) throw new Error("Unterminated comment in template");
        this.i = end + 3;
      } else if (src[at + 1] === "/") {
        const end = src.indexOf(">", at);
        const name = src.slice(at + 2, end).trim();
        if (context !== "element" || tag !== name) throw new Error(`Unexpected </${name}> in template`);
        this.i = end + 1;
        return out;
      } else out.push(this.parseElement(at));
    }
    if (context === "element") throw new Error(`Unclosed <${tag}> in template`);
    if (context === "block") throw new Error("Unclosed block ({) in template");
    return out;
  }

  /** Finds the end of the current text run: the next `<`, or a closing `}` when inside a block. `{{ }}` is skipped whole. */
  private scanText(inBlock: boolean): { end: number; closeBlock: boolean } {
    const src = this.source;
    let p = this.i;
    while (p < src.length) {
      const c = src[p];
      if (c === "<") return { end: p, closeBlock: false };
      if (c === "{" && src[p + 1] === "{") {
        const close = src.indexOf("}}", p);
        if (close === -1) throw new Error("Unterminated {{ in template");
        p = close + 2;
        continue;
      }
      if (c === "}" && inBlock) return { end: p, closeBlock: true };
      p++;
    }
    return { end: p, closeBlock: false };
  }

  private parseElement(lt: number): ElementNode {
    const src = this.source;
    const nameMatch = /^<([A-Za-z][\w-]*)/.exec(src.slice(lt));
    if (!nameMatch) throw new Error(`Unexpected "<" at ${lt} in template`);
    const tag = nameMatch[1]!;
    const el: ElementNode = { type: "element", tag, attrs: [], bindings: [], events: [], models: [], refs: [], children: [] };
    let p = lt + nameMatch[0].length;
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(src[p] ?? "")) p++;
      if (p >= src.length) throw new Error(`Unterminated <${tag}> in template`);
      if (src[p] === ">") {
        p++;
        break;
      }
      if (src.startsWith("/>", p)) {
        selfClosing = true;
        p += 2;
        break;
      }
      ATTR.lastIndex = p;
      const m = ATTR.exec(src);
      if (!m) throw new Error(`Bad attribute in <${tag}>`);
      p = ATTR.lastIndex;
      addAttribute(el, m[1]!, m[2] ?? m[3] ?? "");
    }
    this.i = p;
    if (!selfClosing && !VOID.has(tag)) el.children = this.parseChildren("element", tag);
    return el;
  }
}

function addAttribute(el: ElementNode, name: string, value: string): void {
  if (name.startsWith("[(") && name.endsWith(")]")) {
    el.models.push({ name: name.slice(2, -2), expr: parseExpression(value) });
  } else if (name.startsWith("[") && name.endsWith("]")) {
    const target = name.slice(1, -1);
    const dot = target.indexOf(".");
    const prefix = dot < 0 ? "" : target.slice(0, dot);
    if (prefix === "attr" || prefix === "class" || prefix === "style") {
      el.bindings.push({ kind: prefix, name: target.slice(dot + 1), expr: parseExpression(value) });
    } else el.bindings.push({ kind: "prop", name: target, expr: parseExpression(value) });
  } else if (name.startsWith("(") && name.endsWith(")")) {
    el.events.push({ name: name.slice(1, -1), handler: parseHandler(value) });
  } else if (name.startsWith("#")) {
    el.refs.push(name.slice(1));
  } else if (name.startsWith("*")) {
    throw new Error(`Structural directives ("${name}") do not exist; use @if or @for blocks.`);
  } else {
    if (value.includes("{{")) throw new Error(`Interpolation in attribute "${name}" is not supported; use [attr.${name}] or [${name}].`);
    el.attrs.push({ name, value });
  }
}

function parseInterpolation(raw: string): Array<string | Expr> {
  const parts: Array<string | Expr> = [];
  let i = 0;
  for (;;) {
    const open = raw.indexOf("{{", i);
    if (open === -1) break;
    const close = raw.indexOf("}}", open);
    if (close === -1) throw new Error("Unterminated {{ in template");
    if (open > i) parts.push(raw.slice(i, open));
    parts.push(parseExpression(raw.slice(open + 2, close)));
    i = close + 2;
  }
  if (i < raw.length) parts.push(raw.slice(i));
  return parts;
}
