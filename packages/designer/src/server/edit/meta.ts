// Edits to a component's TypeScript around its template: the `imports` list of its static meta, the file's import
// declarations, and string-valued meta properties. A small scanner (strings, template literals, comments, brackets) is
// enough: the meta object is plain data, and the patches are text insertions, never a reprint of the file.
import { posix } from "node:path";
import type { Hunk } from "./hunks.js";
import { fail } from "./template.js";
import type { EditError } from "./types.js";

/** Index just after the string, template literal or comment that starts at `i`, or `i` when none does. */
function skipLiteral(s: string, i: number): number {
  const c = s[i];
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < s.length && s[j] !== c && s[j] !== "\n") j += s[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < s.length && s[j] !== "`") {
      if (s[j] === "\\") j += 2;
      else if (s[j] === "$" && s[j + 1] === "{") j = skipBraces(s, j + 1);
      else j++;
    }
    return j + 1;
  }
  if (c === "/" && s[i + 1] === "/") {
    const n = s.indexOf("\n", i);
    return n === -1 ? s.length : n;
  }
  if (c === "/" && s[i + 1] === "*") {
    const n = s.indexOf("*/", i + 2);
    return n === -1 ? s.length : n + 2;
  }
  return i;
}

/** Index just after the `{...}` that opens at `i`. */
function skipBraces(s: string, i: number): number {
  let depth = 0;
  for (let j = i; j < s.length; ) {
    const skipped = skipLiteral(s, j);
    if (skipped !== j) {
      j = skipped;
      continue;
    }
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return j + 1;
    j++;
  }
  return s.length;
}

const OPEN: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/** The innermost `{` that encloses `pos`, as `[open, close]` offsets (`close` is the `}`), or null. */
export function enclosingObject(s: string, pos: number): [number, number] | null {
  const stack: Array<{ ch: string; at: number }> = [];
  for (let j = 0; j < s.length; ) {
    if (j >= pos) {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k]!.ch === "{") return findClose(s, stack[k]!.at);
      return null;
    }
    const skipped = skipLiteral(s, j);
    if (skipped !== j) {
      if (pos > j && pos < skipped) {
        for (let k = stack.length - 1; k >= 0; k--) if (stack[k]!.ch === "{") return findClose(s, stack[k]!.at);
        return null;
      }
      j = skipped;
      continue;
    }
    const c = s[j]!;
    if (OPEN[c]) stack.push({ ch: c, at: j });
    else if (c === "}" || c === "]" || c === ")") stack.pop();
    j++;
  }
  return null;
}

const findClose = (s: string, open: number): [number, number] => [open, skipBraces(s, open) - 1];

export interface Prop {
  key: string;
  keyStart: number;
  valueStart: number;
  /** Just after the value (before the `,`). */
  valueEnd: number;
}

/** The top-level properties of the object literal `s[open..close]`. */
export function objectProps(s: string, open: number, close: number): Prop[] {
  const props: Prop[] = [];
  let depth = 0;
  let segStart = open + 1;
  const flush = (end: number) => {
    const seg = s.slice(segStart, end);
    const m = /^\s*(?:(['"])(.*?)\1|([\w$]+))\s*:\s*/.exec(seg);
    if (m) {
      const keyStart = segStart + m[0].search(/\S/);
      let valueEnd = end;
      while (valueEnd > segStart + m[0].length && /\s/.test(s[valueEnd - 1]!)) valueEnd--;
      props.push({ key: m[2] ?? m[3]!, keyStart, valueStart: segStart + m[0].length, valueEnd });
    }
  };
  for (let j = open + 1; j < close; ) {
    const skipped = skipLiteral(s, j);
    if (skipped !== j) {
      j = skipped;
      continue;
    }
    const c = s[j]!;
    if (OPEN[c]) depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === "," && depth === 0) {
      flush(j);
      segStart = j + 1;
    }
    j++;
  }
  flush(close);
  return props;
}

const lineStart = (s: string, i: number) => s.lastIndexOf("\n", i - 1) + 1;
const indentOf = (s: string, i: number) => /^[ \t]*/.exec(s.slice(lineStart(s, i)))![0];

/** The meta object around a template literal that opens at `litOpen`, with its properties; null when it is not an object with a `template`. */
export function metaAround(s: string, litOpen: number): { open: number; close: number; props: Prop[] } | null {
  const range = enclosingObject(s, litOpen);
  if (!range) return null;
  const props = objectProps(s, range[0], range[1]);
  return props.some((p) => p.key === "template") ? { open: range[0], close: range[1], props } : null;
}

/** Hunks that list `name` in the `imports` of the meta object around the template literal. */
export function ensureMetaImport(s: string, litOpen: number, name: string): Hunk[] | EditError {
  const meta = metaAround(s, litOpen);
  if (!meta) return fail("invalid", "The template is not inside a component's static meta object, so its imports cannot be updated.");
  const imports = meta.props.find((p) => p.key === "imports");
  if (!imports) {
    const template = meta.props.find((p) => p.key === "template")!;
    const own = s.slice(lineStart(s, template.keyStart), template.keyStart).trim() === "";
    const at = own ? lineStart(s, template.keyStart) : template.keyStart;
    return [{ start: at, end: at, text: own ? `${indentOf(s, template.keyStart)}imports: [${name}],\n` : `imports: [${name}], ` }];
  }
  if (s[imports.valueStart] !== "[") return fail("invalid", "The component's `imports` is not an array literal, so it cannot be extended safely.");
  const close = imports.valueEnd - 1;
  const inner = s.slice(imports.valueStart + 1, close);
  if (new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(inner)) return [];
  if (inner.trim() === "") return [{ start: imports.valueStart + 1, end: close, text: name }];
  let k = close;
  while (k > imports.valueStart + 1 && /\s/.test(s[k - 1]!)) k--;
  const trailing = s[k - 1] === ",";
  if (inner.includes("\n")) {
    const lastLine = s.slice(lineStart(s, k - 1), k);
    const indent = /^[ \t]*/.exec(lastLine)![0];
    return [{ start: k, end: k, text: trailing ? `\n${indent}${name},` : `,\n${indent}${name}` }];
  }
  return [{ start: k, end: k, text: trailing ? ` ${name},` : `, ${name}` }];
}

/** Hunks that import `name` from `file` (project-relative) into the module `from` (project-relative), unless it already is. */
export function ensureImport(s: string, name: string, file: string, from: string): Hunk[] {
  const decl = /^import\s+(?:type\s+)?([^;'"]*?)\s*from\s*(['"])([^'"\n]+)\2[ \t]*;?[ \t]*$/gm;
  const imports = [...s.matchAll(decl)];
  const nameRe = new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
  if (imports.some((m) => nameRe.test(m[1]!))) return [];

  const relative = posix.relative(posix.dirname("/" + from), "/" + file.replace(/\.tsx?$/, ""));
  const useJs = imports.some((m) => /^\.\.?\//.test(m[3]!) && m[3]!.endsWith(".js")) || !imports.some((m) => /^\.\.?\//.test(m[3]!));
  const spec = (relative.startsWith(".") ? relative : "./" + relative) + (useJs ? ".js" : "");

  const same = imports.find((m) => m[3] === spec && /^\{[\s\S]*\}$/.test(m[1]!.trim()) && !m[0].startsWith("import type"));
  if (same) {
    const braceClose = same.index! + same[0].lastIndexOf("}");
    let k = braceClose;
    while (/\s/.test(s[k - 1]!)) k--;
    return [{ start: k, end: k, text: (s[k - 1] === "," ? " " : ", ") + name + (s[k - 1] === "," ? "," : "") }];
  }
  const quote = imports[0]?.[2] ?? "'";
  const semi = imports.length === 0 || imports[0]![0].trimEnd().endsWith(";") ? ";" : "";
  const line = `import { ${name} } from ${quote}${spec}${quote}${semi}`;
  const last = imports[imports.length - 1];
  if (!last) return [{ start: 0, end: 0, text: line + "\n" }];
  const at = last.index! + last[0].length;
  return [{ start: at, end: at, text: "\n" + line }];
}

const SETTABLE = new Set(["selector", "id", "encapsulation"]);

/** Hunks that set a string-valued static meta property of the component that owns the template at `litOpen`. */
export function setMetaString(s: string, litOpen: number, key: string, value: string): Hunk[] | EditError {
  if (!SETTABLE.has(key)) return fail("invalid", `The Designer edits only ${[...SETTABLE].join(", ")} in a component's meta; "${key}" is code.`);
  if (value === "" || /['"`\\\n$]/.test(value)) return fail("invalid", "The value must be plain text without quotes or backslashes.");
  const meta = metaAround(s, litOpen);
  if (!meta) return fail("invalid", "The template is not inside a component's static meta object.");
  const prop = meta.props.find((p) => p.key === key);
  if (prop) {
    const q = s[prop.valueStart];
    if ((q !== "'" && q !== '"') || s[prop.valueEnd - 1] !== q) return fail("readonly", `"${key}" is not a plain string, so it is shown but not rewritten.`);
    return [{ start: prop.valueStart + 1, end: prop.valueEnd - 1, text: value }];
  }
  const template = meta.props.find((p) => p.key === "template")!;
  const own = s.slice(lineStart(s, template.keyStart), template.keyStart).trim() === "";
  const at = own ? lineStart(s, template.keyStart) : template.keyStart;
  const quote = meta.props.map((p) => s[p.valueStart]).find((c) => c === "'" || c === '"') ?? "'";
  return [{ start: at, end: at, text: own ? `${indentOf(s, template.keyStart)}${key}: ${quote}${value}${quote},\n` : `${key}: ${quote}${value}${quote}, ` }];
}
