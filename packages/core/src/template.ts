import { parseExpression, type Expr } from "./expression.js";

export type TemplateNode =
  | { type: "element"; tag: string; attrs: Array<{ name: string; value: string }>; props: Array<{ name: string; expr: Expr }>; children: TemplateNode[] }
  | { type: "text"; parts: Array<string | Expr> };

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
    parsed = parse(result.strings[0]!);
    cache.set(result.strings, parsed);
  }
  return parsed;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ATTR = /\s*([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;

function parse(source: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: Array<{ tag: string; children: TemplateNode[] }> = [{ tag: "", children: root }];
  let i = 0;
  const top = () => stack[stack.length - 1]!;

  const pushText = (raw: string) => {
    if (raw === "" || (/^\s*$/.test(raw) && raw.includes("\n"))) return;
    top().children.push({ type: "text", parts: parseInterpolation(raw) });
  };

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      pushText(source.slice(i));
      break;
    }
    pushText(source.slice(i, lt));
    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt);
      if (end === -1) throw new Error("Unterminated comment in template");
      i = end + 3;
    } else if (source[lt + 1] === "/") {
      const end = source.indexOf(">", lt);
      const name = source.slice(lt + 2, end).trim();
      if (stack.length === 1 || top().tag !== name) throw new Error(`Unexpected </${name}> in template`);
      stack.pop();
      i = end + 1;
    } else {
      const nameMatch = /^<([A-Za-z][\w-]*)/.exec(source.slice(lt));
      if (!nameMatch) throw new Error(`Unexpected "<" at ${lt} in template`);
      const tag = nameMatch[1]!;
      const el: Extract<TemplateNode, { type: "element" }> = { type: "element", tag, attrs: [], props: [], children: [] };
      let p = lt + nameMatch[0].length;
      let selfClosing = false;
      for (;;) {
        while (/\s/.test(source[p] ?? "")) p++;
        if (p >= source.length) throw new Error(`Unterminated <${tag}> in template`);
        if (source[p] === ">") {
          p++;
          break;
        }
        if (source.startsWith("/>", p)) {
          selfClosing = true;
          p += 2;
          break;
        }
        ATTR.lastIndex = p;
        const m = ATTR.exec(source);
        if (!m) throw new Error(`Bad attribute in <${tag}>`);
        p = ATTR.lastIndex;
        const name = m[1]!;
        const value = m[2] ?? m[3] ?? "";
        if (name.startsWith("[") && name.endsWith("]") && !name.startsWith("[(")) {
          el.props.push({ name: name.slice(1, -1), expr: parseExpression(value) });
        } else if (/^[[(#*@]/.test(name)) {
          throw new Error(`Template syntax "${name}" is not supported yet`);
        } else el.attrs.push({ name, value });
      }
      top().children.push(el);
      if (!selfClosing && !VOID.has(tag)) stack.push({ tag, children: el.children });
      i = p;
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed <${top().tag}> in template`);
  return root;
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
