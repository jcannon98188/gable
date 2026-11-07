// CSS write-back: set or remove one declaration of a rule, as a text patch of just that declaration. A small scanner (comments,
// strings, nested blocks) finds the rule; nothing is reprinted. The last top-level rule with exactly the selector wins (it is the
// one the cascade lets win), and a rule that does not exist is appended at the end of the file.
import type { Hunk } from "./hunks.js";
import { fail } from "./template.js";
import type { EditError } from "./types.js";

interface Rule {
  selector: string;
  /** Offset of the `{` and of the `}`. */
  open: number;
  close: number;
  /** Offset where the prelude starts. */
  start: number;
}

/** Rules at the top level and inside `@media`-style blocks (any block whose prelude starts with `@`). */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const scan = (from: number, to: number) => {
    let i = from;
    let preludeStart = from;
    while (i < to) {
      const c = css[i]!;
      if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        i = end === -1 ? to : end + 2;
        if (css.slice(preludeStart, i).replace(/\/\*[\s\S]*?\*\//g, "").trim() === "") preludeStart = i;
        continue;
      }
      if (c === '"' || c === "'") {
        i++;
        while (i < to && css[i] !== c) i += css[i] === "\\" ? 2 : 1;
        i++;
        continue;
      }
      if (c === ";") {
        preludeStart = ++i;
        continue;
      }
      if (c === "{") {
        const close = matching(css, i);
        const prelude = css.slice(preludeStart, i).replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (prelude.startsWith("@")) scan(i + 1, close);
        else out.push({ selector: prelude.replace(/\s+/g, " "), open: i, close, start: preludeStart });
        i = close + 1;
        preludeStart = i;
        continue;
      }
      i++;
    }
  };
  scan(0, css.length);
  return out;
}

function matching(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") i = (css.indexOf("*/", i + 2) + 1 || css.length) - 1;
    else if (c === '"' || c === "'") {
      i++;
      while (i < css.length && css[i] !== c) i += css[i] === "\\" ? 2 : 1;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return css.length;
}

interface Declaration {
  property: string;
  start: number;
  valueStart: number;
  /** End of the value (before `;`). */
  valueEnd: number;
  /** End including the `;` when there is one. */
  end: number;
}

function declarations(css: string, rule: Rule): Declaration[] {
  const out: Declaration[] = [];
  let i = rule.open + 1;
  let start = i;
  const flush = (end: number, stop: number) => {
    const seg = css.slice(start, end);
    const m = /^(\s*)(-{0,2}[a-zA-Z][\w-]*)\s*:\s*/.exec(seg);
    if (m) {
      let valueEnd = end;
      while (valueEnd > start + m[0].length && /\s/.test(css[valueEnd - 1]!)) valueEnd--;
      out.push({ property: m[2]!, start: start + m[1]!.length, valueStart: start + m[0].length, valueEnd, end: stop });
    }
  };
  let depth = 0;
  while (i < rule.close) {
    const c = css[i]!;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? rule.close : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < rule.close && css[i] !== c) i += css[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (c === "(" || c === "{") depth++;
    else if (c === ")" || c === "}") depth--;
    else if (c === ";" && depth === 0) {
      flush(i, i + 1);
      start = i + 1;
    }
    i++;
  }
  flush(rule.close, rule.close);
  return out;
}

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;

export function setCssDeclaration(css: string, selector: string, property: string, value: string | null): Hunk[] | EditError {
  if (!/^-{0,2}[a-zA-Z][\w-]*$/.test(property)) return fail("invalid", `"${property}" is not a CSS property name.`);
  if (value !== null && (value.trim() === "" || /[;{}]|\/\*|\*\//.test(value))) return fail("invalid", "The value must be a plain CSS value (no ; { } or comments).");
  const sel = selector.replace(/\s+/g, " ").trim();
  if (sel === "" || /[{};]|\/\*/.test(sel)) return fail("invalid", "Not a plain selector.");
  const rule = rules(css)
    .filter((r) => r.selector === sel)
    .pop();
  if (!rule) {
    if (value === null) return fail("nothing", `No rule "${sel}" to remove from.`);
    const tail = css.endsWith("\n") || css === "" ? "" : "\n";
    return [{ start: css.length, end: css.length, text: `${tail}${css === "" ? "" : "\n"}${sel} {\n  ${property}: ${value.trim()};\n}\n` }];
  }
  const decls = declarations(css, rule).filter((d) => d.property === property);
  const existing = decls[decls.length - 1];
  if (existing) {
    if (value === null) {
      const own = css.slice(lineStart(css, existing.start), existing.start).trim() === "" && css.slice(existing.end, css.indexOf("\n", existing.end) === -1 ? css.length : css.indexOf("\n", existing.end)).trim() === "";
      if (own) {
        const nl = css.indexOf("\n", existing.end);
        return [{ start: lineStart(css, existing.start), end: nl === -1 ? css.length : nl + 1, text: "" }];
      }
      return [{ start: existing.start, end: existing.end, text: "" }];
    }
    return [{ start: existing.valueStart, end: existing.valueEnd, text: value.trim() }];
  }
  if (value === null) return fail("nothing", `"${sel}" has no ${property} to remove.`);
  const all = declarations(css, rule);
  const last = all[all.length - 1];
  if (!last) {
    const closeIndent = /^[ \t]*/.exec(css.slice(lineStart(css, rule.close)))![0];
    const inner = css.slice(rule.open + 1, rule.close);
    if (inner.includes("\n")) return [{ start: rule.open + 1, end: rule.close, text: `\n${closeIndent}  ${property}: ${value.trim()};\n${closeIndent}` }];
    return [{ start: rule.open + 1, end: rule.close, text: ` ${property}: ${value.trim()}; ` }];
  }
  const indent = /^[ \t]*/.exec(css.slice(lineStart(css, last.start)))![0];
  const onOwnLine = css.slice(lineStart(css, last.start), last.start).trim() === "";
  const semi = css[last.end - 1] === ";";
  if (onOwnLine) return [{ start: last.end, end: last.end, text: `${semi ? "" : ";"}\n${indent}${property}: ${value.trim()};` }];
  return [{ start: last.end, end: last.end, text: `${semi ? "" : ";"} ${property}: ${value.trim()};` }];
}
