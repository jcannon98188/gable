import { DEV } from "./dev-hooks.js";
import { parseExpression, parseHandler, type Expr, type HandlerExpr } from "./expression.js";
import { messageFromParts, messageId, parseMarker } from "./i18n-message.js";

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
  /** Static attributes marked `i18n-<name>`: translated against the catalog (they are not in `attrs`). */
  i18nAttrs?: Array<{ name: string; value: string; i18n: I18nInfo }>;
  children: TemplateNode[];
  /** Dev only: where this element sits in its template's source string (offsets into `strings[0]`), and which template. */
  pos?: SourcePos;
}

export interface SourcePos {
  /** Offset of the `<`. */
  start: number;
  /** Offset just after the opening tag's `>`. */
  openEnd: number;
  /** Offset just after the element (after the closing tag, or the opening tag for void/self-closing elements). */
  end: number;
  /** The call site's strings array: identifies the template. */
  tpl: TemplateStringsArray;
}

export interface IfNode {
  type: "if";
  /** `cond` is null for the final `@else`; `alias` comes from `@if (x; as alias)`. */
  branches: Array<{ cond: Expr | null; alias?: string; children: TemplateNode[] }>;
}
export interface ForNode {
  type: "for";
  item: string;
  source: Expr;
  track: Expr;
  children: TemplateNode[];
  empty?: TemplateNode[];
}
export interface SwitchNode {
  type: "switch";
  expr: Expr;
  /** `expr` is null for `@default`. */
  cases: Array<{ expr: Expr | null; children: TemplateNode[] }>;
}
export interface DeferNode {
  type: "defer";
  /** `when` condition, if any. */
  when: Expr | null;
  /** `on` triggers; arguments are numbers (durations in ms) or identifier strings. With neither `when` nor `on`, the block defers to idle. */
  triggers: Array<{ name: string; args: unknown[] }>;
  children: TemplateNode[];
  placeholder?: TemplateNode[];
  loading?: TemplateNode[];
  error?: TemplateNode[];
}
export interface LetNode {
  type: "let";
  name: string;
  expr: Expr;
}

/** A translatable message found in a template: the element text of an `i18n` element, or an `i18n-<attr>` value. */
export interface I18nInfo {
  /** The explicit `@@id`, or the id derived from `message` and `description`. */
  id: string;
  /** Source-language message: `{0}`, `{1}`... stand for the `{{ }}` expressions in order. */
  message: string;
  description: string;
  /** The expression text behind each placeholder. */
  placeholders: string[];
}

export type TextNode = { type: "text"; parts: Array<string | Expr>; /** Set on the text of an `i18n` element. */ i18n?: I18nInfo };
export type TemplateNode = ElementNode | IfNode | ForNode | SwitchNode | DeferNode | LetNode | TextNode;

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
    if (result.values.length > 0) throw new Error("html`` does not support ${} holes: templates are static strings. Use a small component for reusable markup (TASK-30)");
    parsed = new Parser(result.strings[0]!, DEV ? result.strings : undefined).parseChildren("root");
    cache.set(result.strings, parsed);
  }
  return parsed;
}

export const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ATTR = /\s*([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;

class Parser {
  i = 0;
  constructor(readonly source: string, readonly tpl?: TemplateStringsArray) {}

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
      if (src[at] === "@") {
        out.push(this.parseBlock());
      } else if (src.startsWith("<!--", at)) {
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
      if (c === "@" && BLOCK_START.test(src.slice(p, p + 12)) && !/[\w.]/.test(src[p - 1] ?? " ")) return { end: p, closeBlock: false };
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

  private skipSpace(): void {
    while (/\s/.test(this.source[this.i] ?? "")) this.i++;
  }

  /** Reads a balanced `( ... )` header and returns its inner text. */
  private readHeader(block: string): string {
    this.skipSpace();
    const src = this.source;
    if (src[this.i] !== "(") throw new Error(`@${block} must be followed by (...)`);
    let depth = 0;
    let quote = "";
    for (let p = this.i; p < src.length; p++) {
      const c = src[p]!;
      if (quote) {
        if (c === "\\") p++;
        else if (c === quote) quote = "";
      } else if (c === "'" || c === '"') quote = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) {
        const inner = src.slice(this.i + 1, p);
        this.i = p + 1;
        return inner;
      }
    }
    throw new Error(`Unterminated (...) after @${block}`);
  }

  private readBody(block: string): TemplateNode[] {
    this.skipSpace();
    if (this.source[this.i] !== "{") throw new Error(`@${block} must be followed by a { ... } block`);
    this.i++;
    return this.parseChildren("block");
  }

  /** If the next non-space text is `@word`, consumes it (and the space) and returns true. */
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

  private parseBlock(): TemplateNode {
    const src = this.source;
    const name = /^@(\w+)/.exec(src.slice(this.i))![1]!;
    this.i += name.length + 1;
    switch (name) {
      case "let": {
        const end = indexOfTopLevel(src, ";", this.i);
        if (end === -1) throw new Error("@let must end with ;");
        const m = /^\s*([A-Za-z_$][\w$]*)\s*=([\s\S]*)$/.exec(src.slice(this.i, end));
        if (!m) throw new Error("@let must look like: @let name = expression;");
        this.i = end + 1;
        return { type: "let", name: m[1]!, expr: parseExpression(m[2]!) };
      }
      case "if": {
        const branches: IfNode["branches"] = [];
        let header = this.readHeader("if");
        for (;;) {
          const [cond, alias] = parseConditionHeader(header);
          branches.push({ cond, alias, children: this.readBody("if") });
          if (!this.eat("else")) break;
          this.skipSpace();
          if (/^if\b/.test(src.slice(this.i))) {
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
        const parts = splitTopLevel(this.readHeader("for"), ";");
        const m = /^\s*([A-Za-z_$][\w$]*)\s+of\s+([\s\S]+)$/.exec(parts[0]!);
        if (!m) throw new Error("@for must look like: @for (item of items(); track item.id)");
        const trackPart = parts.slice(1).find((p) => /^\s*track\s/.test(p));
        if (!trackPart) {
          throw new Error(`@for (${parts[0]!.trim()}) needs a track expression, e.g. @for (${parts[0]!.trim()}; track ${m[1]}.id)`);
        }
        const children = this.readBody("for");
        const empty = this.eat("empty") ? this.readBody("empty") : undefined;
        return {
          type: "for",
          item: m[1]!,
          source: parseExpression(m[2]!),
          track: parseExpression(trackPart.replace(/^\s*track\s/, "")),
          children,
          empty,
        };
      }
      case "switch": {
        const expr = parseExpression(this.readHeader("switch"));
        this.skipSpace();
        if (src[this.i] !== "{") throw new Error("@switch must be followed by a { ... } block");
        this.i++;
        const cases: SwitchNode["cases"] = [];
        for (;;) {
          this.skipSpace();
          if (src[this.i] === "}") {
            this.i++;
            return { type: "switch", expr, cases };
          }
          if (this.eat("case")) cases.push({ expr: parseExpression(this.readHeader("case")), children: this.readBody("case") });
          else if (this.eat("default")) cases.push({ expr: null, children: this.readBody("default") });
          else throw new Error("@switch may only contain @case and @default blocks");
        }
      }
      case "defer": {
        let when: Expr | null = null;
        const triggers: DeferNode["triggers"] = [];
        this.skipSpace();
        const header = src[this.i] === "(" ? this.readHeader("defer") : "";
        for (const part of splitTopLevel(header, ";")) {
          const clause = part.trim();
          if (clause === "") continue;
          if (/^when\s/.test(clause)) {
            if (when) throw new Error("@defer allows one `when` condition");
            when = parseExpression(clause.slice(5));
          } else if (/^on\s/.test(clause)) {
            for (const item of splitTopLevel(clause.slice(3), ",")) triggers.push(parseTrigger(item));
          } else throw new Error(`@defer header clauses must start with "when" or "on", got "${clause}"`);
        }
        const children = this.readBody("defer");
        const node: DeferNode = { type: "defer", when, triggers, children };
        for (;;) {
          const section = (["placeholder", "loading", "error"] as const).find((s) => this.eat(s));
          if (!section) break;
          if (node[section]) throw new Error(`@defer has more than one @${section} block`);
          node[section] = this.readBody(section);
        }
        return node;
      }
      default:
        throw new Error(`Unexpected @${name} in template (it must follow an @if, @for or @switch block)`);
    }
  }

  /** `<p i18n="...">text {{ x }}</p>`: the element's only child, a text run, becomes a message. */
  private markElementText(el: ElementNode, marker: string, openEnd: number): void {
    const text = el.children[0];
    if (el.children.length === 0) return;
    if (el.children.length > 1 || text!.type !== "text") {
      throw new Error(`<${el.tag} i18n> may only contain text and {{ }} interpolations (put i18n on the inner elements instead)`);
    }
    const raw = this.source.slice(openEnd, this.source.lastIndexOf("</", this.i));
    const strings: string[] = [];
    const placeholders: string[] = [];
    let last = 0;
    for (const m of raw.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      strings.push(raw.slice(last, m.index));
      placeholders.push(m[1]!.trim());
      last = m.index! + m[0].length;
    }
    strings.push(raw.slice(last));
    text.i18n = i18nInfo(marker, strings, placeholders);
  }

  private parseElement(lt: number): ElementNode {
    const src = this.source;
    const nameMatch = /^<([A-Za-z][\w-]*)/.exec(src.slice(lt));
    if (!nameMatch) throw new Error(`Unexpected "<" at ${lt} in template`);
    const tag = nameMatch[1]!;
    const el: ElementNode = { type: "element", tag, attrs: [], bindings: [], events: [], models: [], refs: [], children: [] };
    let p = lt + nameMatch[0].length;
    let selfClosing = false;
    let marker: string | undefined;
    const attrMarkers: Array<{ attr: string; value: string }> = [];
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
      const value = m[2] ?? m[3] ?? "";
      if (m[1] === "i18n") marker = value;
      else if (m[1]!.startsWith("i18n-") && m[1]!.length > 5) attrMarkers.push({ attr: m[1]!.slice(5), value });
      else addAttribute(el, m[1]!, value);
    }
    for (const { attr, value } of attrMarkers) {
      const at = el.attrs.findIndex((a) => a.name === attr);
      if (at === -1) {
        throw new Error(`i18n-${attr} on <${tag}> needs a static ${attr}="..." attribute to translate (bindings such as [${attr}] are not translatable)`);
      }
      const text = el.attrs.splice(at, 1)[0]!.value;
      (el.i18nAttrs ??= []).push({ name: attr, value: text, i18n: i18nInfo(value, [text], []) });
    }
    this.i = p;
    const openEnd = p;
    if (!selfClosing && !VOID.has(tag)) el.children = this.parseChildren("element", tag);
    if (marker !== undefined) this.markElementText(el, marker, openEnd);
    if (this.tpl) el.pos = { start: lt, openEnd, end: this.i, tpl: this.tpl };
    return el;
  }
}

/** The translatable info of a marker and the static pieces of a message (placeholders are the gaps). */
function i18nInfo(markerValue: string, strings: string[], placeholders: string[]): I18nInfo {
  const marker = parseMarker(markerValue);
  const parts: Array<string | { placeholder: true }> = [];
  strings.forEach((s, i) => {
    if (i > 0) parts.push({ placeholder: true });
    parts.push(s);
  });
  const message = messageFromParts(parts);
  return { id: marker.id ?? messageId(message, marker.description), message, description: marker.description, placeholders };
}

export const BLOCK_START = /^@(?:if|else|for|empty|switch|case|default|let|defer|placeholder|loading|error)\b/;

/** Index of `char` outside quotes and parentheses, or -1. */
export function indexOfTopLevel(source: string, char: string, from = 0): number {
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

function splitTopLevel(source: string, char: string): string[] {
  const out: string[] = [];
  let rest = source;
  for (;;) {
    const at = indexOfTopLevel(rest, char);
    if (at === -1) return [...out, rest];
    out.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
}

/** `idle`, `timer(500)`, `viewport(ref)`: durations (`500`, `500ms`, `2s`) become milliseconds, other arguments stay strings. */
function parseTrigger(source: string): { name: string; args: unknown[] } {
  const m = /^\s*([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(source);
  if (!m) throw new Error(`Bad @defer trigger "${source.trim()}"`);
  const args = splitTopLevel(m[2] ?? "", ",")
    .map((a) => a.trim())
    .filter((a) => a !== "")
    .map((a) => {
      const d = /^(\d+(?:\.\d+)?)(ms|s)?$/.exec(a);
      return d ? Number(d[1]) * (d[2] === "s" ? 1000 : 1) : a;
    });
  return { name: m[1]!, args };
}

/** `cond` or `cond; as alias`. */
function parseConditionHeader(header: string): [Expr, string | undefined] {
  const [cond, aliasPart, ...extra] = splitTopLevel(header, ";");
  let alias: string | undefined;
  if (aliasPart !== undefined) {
    const m = /^\s*as\s+([A-Za-z_$][\w$]*)\s*$/.exec(aliasPart);
    if (!m || extra.length) throw new Error(`Expected "; as name" after the condition in "${header.trim()}"`);
    alias = m[1];
  }
  return [parseExpression(cond!), alias];
}

export function addAttribute(el: ElementNode, name: string, value: string): void {
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
