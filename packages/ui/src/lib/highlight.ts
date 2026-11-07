// A small, dependency-free syntax tokenizer for `ui-code-block`. Pure, linear time, never throws, and lossless: the token
// texts of every line concatenate to exactly that line of the source. It is a highlighter, not a parser: it colours what
// is recognisable (comments, strings, numbers, keywords, tags, ...) and leaves the rest plain.

/** The class of a highlighted token. Style each kind with CSS; `plain` is everything the highlighter does not recognise. */
export type TokenKind = "keyword" | "string" | "number" | "comment" | "punctuation" | "function" | "type" | "tag" | "attr" | "property" | "plain";

/** A piece of one line of highlighted code: its text and its kind. The texts of a line's tokens concatenate to the line. */
export interface Token {
  text: string;
  kind: TokenKind;
}

/** A tokenizer: the source and a language name in, the tokens of each line out (so Shiki and friends can be adapted). */
export type Highlighter = (code: string, language: string) => Token[][];

/** The languages the built-in highlighter understands. Anything else is treated as `text` (no colouring). */
export type BuiltinLanguage = "ts" | "tsx" | "js" | "jsx" | "json" | "html" | "css" | "bash" | "text";

const ALIASES: Record<string, BuiltinLanguage> = {
  ts: "ts", typescript: "ts", mts: "ts", cts: "ts",
  tsx: "tsx",
  js: "js", javascript: "js", mjs: "js", cjs: "js",
  jsx: "jsx",
  json: "json", jsonc: "json", json5: "json",
  html: "html", htm: "html", xml: "html", svg: "html", gable: "html", vue: "html",
  css: "css", scss: "css", less: "css",
  bash: "bash", sh: "bash", shell: "bash", zsh: "bash", console: "bash",
};

/** The built-in language a name (`"TypeScript"`, `"sh"`, ...) maps to; anything unknown is `"text"`. */
export function normalizeLanguage(language: string): BuiltinLanguage {
  return ALIASES[String(language ?? "").trim().toLowerCase()] ?? "text";
}

type Span = [kind: TokenKind, start: number, end: number];

const words = (list: string) => new Set(list.split(" "));
const JS_KEYWORDS = words(
  "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface is keyof let namespace new null of override private protected public readonly return satisfies set static super switch this throw true try typeof undefined var void while with yield",
);
const JS_TYPES = words("string number boolean bigint symbol object unknown never any void Array Promise Record Map Set Partial Readonly Date RegExp Error");
const TYPE_AFTER = words("class interface type enum extends implements new namespace");

const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y;
const IDENT = /[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/y;

/** Reads a quoted string starting at `i`; stops at the closing quote, or (single-line) at the end of the line. */
function quoted(s: string, i: number, end: number, multiline: boolean): number {
  const q = s[i];
  let j = i + 1;
  while (j < end) {
    const c = s[j];
    if (c === "\\") j += 2;
    else if (c === q) return j + 1;
    else if (c === "\n" && !multiline) return j;
    else j++;
  }
  return Math.min(j, end);
}

function sticky(re: RegExp, s: string, i: number): number {
  re.lastIndex = i;
  const m = re.exec(s);
  return m ? i + m[0].length : -1;
}

type Emit = (kind: TokenKind, a: number, b: number) => void;

function scanJs(s: string, from: number, end: number, emit: Emit, jsx: boolean): void {
  let i = from;
  let depth = 0;
  const tpl: number[] = [];
  let prevText = "";
  let prevKind = "plain" as TokenKind;
  let tagDepth = -1;
  const set = (kind: TokenKind, text: string) => {
    prevKind = kind;
    prevText = text;
  };
  const template = (start: number, from: number): number => {
    let j = from;
    while (j < end) {
      const c = s[j];
      if (c === "\\") j += 2;
      else if (c === "`") {
        emit("string", start, j + 1);
        return j + 1;
      } else if (c === "$" && s[j + 1] === "{") {
        emit("string", start, j);
        emit("punctuation", j, j + 2);
        tpl.push(depth);
        return j + 2;
      } else j++;
    }
    emit("string", start, Math.min(j, end));
    return end;
  };
  while (i < end) {
    const code = s.charCodeAt(i);
    if (isSpace(code)) {
      i++;
      continue;
    }
    const c = s[i]!;
    const n = s[i + 1];
    if (c === "/" && n === "/") {
      let j = s.indexOf("\n", i);
      if (j < 0 || j > end) j = end;
      emit("comment", i, j);
      i = j;
      continue;
    }
    if (c === "/" && n === "*") {
      let j = s.indexOf("*/", i + 2);
      j = j < 0 || j + 2 > end ? end : j + 2;
      emit("comment", i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const j = quoted(s, i, end, false);
      emit("string", i, j);
      set("string", "");
      i = j;
      continue;
    }
    if (c === "`") {
      i = template(i, i + 1);
      set("string", "");
      continue;
    }
    const isDigit = code >= 48 && code <= 57;
    if (isDigit || (c === "." && n !== undefined && n >= "0" && n <= "9")) {
      const j = sticky(NUMBER, s, i);
      if (j > i) {
        emit("number", i, Math.min(j, end));
        set("number", "");
        i = Math.min(j, end);
        continue;
      }
    }
    const idEnd = sticky(IDENT, s, i);
    if (idEnd > i) {
      const j = Math.min(idEnd, end);
      const word = s.slice(i, j);
      let kind: TokenKind = "plain";
      let k = j;
      while (k < end && (s[k] === " " || s[k] === "\t")) k++;
      const afterDot = prevText === ".";
      if (tagDepth === depth && tagDepth >= 0) kind = "attr";
      else if (s[j] === "(" || (s[j] === "`" && !JS_KEYWORDS.has(word))) kind = "function";
      else if (afterDot) kind = "property";
      else if (prevKind === "keyword" && prevText === "function") kind = "function";
      else if (TYPE_AFTER.has(prevText) && prevKind === "keyword") kind = "type";
      else if (JS_KEYWORDS.has(word)) kind = "keyword";
      else if (JS_TYPES.has(word) || /^[A-Z]/.test(word)) kind = "type";
      else if (s[k] === ":" && s[k + 1] !== ":" && (prevText === "{" || prevText === ",")) kind = "property";
      emit(kind, i, j);
      set(kind, word);
      i = j;
      continue;
    }
    // Punctuation.
    if (jsx && c === "<" && n !== undefined && /[A-Za-z/>]/.test(n) && (prevText === "" || prevKind === "keyword" || (prevKind === "punctuation" && !")]}".includes(prevText)))) {
      const close = n === "/";
      const open = i + (close ? 2 : 1);
      emit("punctuation", i, open);
      const nameEnd = Math.min(sticky(/[A-Za-z_$][\w$.:-]*/y, s, open), end);
      if (nameEnd > open) emit("tag", open, nameEnd);
      set("punctuation", "<");
      i = Math.max(nameEnd, open);
      tagDepth = depth;
      continue;
    }
    if (c === "}" && tpl.length > 0 && tpl[tpl.length - 1] === depth) {
      tpl.pop();
      emit("punctuation", i, i + 1);
      i = template(i + 1, i + 1);
      set("string", "");
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === ">" && tagDepth === depth) tagDepth = -1;
    emit("punctuation", i, i + 1);
    set("punctuation", c);
    i++;
  }
}

function scanJson(s: string, end: number, emit: Emit): void {
  let i = 0;
  while (i < end) {
    const code = s.charCodeAt(i);
    if (isSpace(code)) {
      i++;
      continue;
    }
    const c = s[i]!;
    const n = s[i + 1];
    if (c === "/" && n === "/") {
      const j = s.indexOf("\n", i);
      const e = j < 0 ? end : j;
      emit("comment", i, e);
      i = e;
    } else if (c === "/" && n === "*") {
      const j = s.indexOf("*/", i + 2);
      const e = j < 0 ? end : j + 2;
      emit("comment", i, e);
      i = e;
    } else if (c === '"') {
      const j = quoted(s, i, end, false);
      let k = j;
      while (k < end && (s[k] === " " || s[k] === "\t")) k++;
      emit(s[k] === ":" ? "property" : "string", i, j);
      i = j;
    } else if ((code >= 48 && code <= 57) || (c === "-" && n !== undefined && n >= "0" && n <= "9")) {
      const j = sticky(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y, s, i);
      const e = j > i ? j : i + 1;
      emit(j > i ? "number" : "punctuation", i, e);
      i = e;
    } else {
      const j = sticky(/[A-Za-z_$][\w$]*/y, s, i);
      if (j > i) {
        const w = s.slice(i, j);
        if (w === "true" || w === "false" || w === "null") emit("keyword", i, j);
        i = j;
      } else {
        emit("punctuation", i, i + 1);
        i++;
      }
    }
  }
}

function scanCss(s: string, from: number, end: number, emit: Emit): void {
  let i = from;
  let mode: "sel" | "decl" | "value" | "at" = "sel";
  let stmt = true;
  let bracket = 0;
  while (i < end) {
    const code = s.charCodeAt(i);
    if (isSpace(code)) {
      i++;
      continue;
    }
    const c = s[i]!;
    const n = s[i + 1];
    if (c === "/" && n === "*") {
      let j = s.indexOf("*/", i + 2);
      j = j < 0 || j + 2 > end ? end : j + 2;
      emit("comment", i, j);
      i = j;
      continue;
    }
    if (stmt) {
      stmt = false;
      bracket = 0;
      if (c === "@") mode = "at";
      else {
        let j = i;
        while (j < end && s[j] !== ";" && s[j] !== "{" && s[j] !== "}") j++;
        mode = s[j] === "{" ? "sel" : "decl";
      }
    }
    if (c === '"' || c === "'") {
      const j = quoted(s, i, end, false);
      emit("string", i, j);
      i = j;
      continue;
    }
    if (c === "{" || c === "}" || c === ";") {
      emit("punctuation", i, i + 1);
      stmt = true;
      i++;
      continue;
    }
    if (c === "@") {
      const j = Math.min(sticky(/@[\w-]+/y, s, i), end);
      emit("keyword", i, j > i ? j : i + 1);
      i = j > i ? j : i + 1;
      continue;
    }
    if (mode === "sel") {
      if (c === "[") bracket++;
      else if (c === "]") bracket = Math.max(0, bracket - 1);
      const j = Math.min(sticky(/[.#]?-*[A-Za-z_\u0080-￿][\w\u0080-￿-]*/y, s, i), end);
      if (j > i) {
        const first = c;
        emit(bracket > 0 ? "attr" : first === "." || first === "#" ? "type" : "tag", i, j);
        i = j;
        continue;
      }
      if (c === ":") {
        const j2 = Math.min(sticky(/::?-*[A-Za-z][\w-]*/y, s, i), end);
        if (j2 > i) {
          emit("keyword", i, j2);
          i = j2;
          continue;
        }
      }
    } else if (mode === "decl") {
      const j = Math.min(sticky(/-*[A-Za-z_][\w-]*/y, s, i), end);
      if (j > i) {
        emit("property", i, j);
        i = j;
        continue;
      }
      if (c === ":") mode = "value";
    } else {
      // value (and at-rule preludes)
      const j = Math.min(sticky(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:%|[A-Za-z]+)?/y, s, i), end);
      if (j > i) {
        emit("number", i, j);
        i = j;
        continue;
      }
      if (c === "#") {
        const h = Math.min(sticky(/#[\w-]+/y, s, i), end);
        if (h > i) {
          emit("number", i, h);
          i = h;
          continue;
        }
      }
      if (c === "!") {
        const h = Math.min(sticky(/![A-Za-z]+/y, s, i), end);
        if (h > i) {
          emit("keyword", i, h);
          i = h;
          continue;
        }
      }
      const w = Math.min(sticky(/-*[A-Za-z_][\w-]*/y, s, i), end);
      if (w > i) {
        const word = s.slice(i, w);
        emit(word.startsWith("--") ? "property" : s[w] === "(" ? "function" : "plain", i, w);
        i = w;
        continue;
      }
    }
    emit("punctuation", i, i + 1);
    i++;
  }
}

const HTML_FLOW = /@(?:if|else|for|switch|case|default|empty|defer|placeholder|loading|error|let)\b/y;

function scanHtml(s: string, from: number, end: number, emit: Emit): void {
  let i = from;
  while (i < end) {
    const c = s[i]!;
    const n = s[i + 1];
    if (c === "<" && s.startsWith("<!--", i)) {
      const j = s.indexOf("-->", i + 4);
      const e = j < 0 || j + 3 > end ? end : j + 3;
      emit("comment", i, e);
      i = e;
    } else if (c === "<" && n === "!") {
      let j = s.indexOf(">", i);
      j = j < 0 || j + 1 > end ? end : j + 1;
      emit("keyword", i, j);
      i = j;
    } else if (c === "<" && n !== undefined && (/[A-Za-z]/.test(n) || (n === "/" && /[A-Za-z]/.test(s[i + 2] ?? "")))) {
      const closing = n === "/";
      const open = i + (closing ? 2 : 1);
      emit("punctuation", i, open);
      const nameEnd = Math.min(sticky(/[A-Za-z][\w.:-]*/y, s, open), end);
      emit("tag", open, nameEnd);
      const name = s.slice(open, nameEnd).toLowerCase();
      i = nameEnd;
      let selfClose = false;
      while (i < end) {
        const d = s.charCodeAt(i);
        if (isSpace(d)) {
          i++;
          continue;
        }
        const ch = s[i]!;
        if (ch === ">") {
          emit("punctuation", i, i + 1);
          i++;
          break;
        }
        if (ch === "<") break;
        if (ch === "/" && s[i + 1] === ">") {
          emit("punctuation", i, i + 2);
          selfClose = true;
          i += 2;
          break;
        }
        if (ch === "=") {
          emit("punctuation", i, i + 1);
          i++;
          while (i < end && (s[i] === " " || s[i] === "\t")) i++;
          const q = s[i];
          if (q === '"' || q === "'") {
            let j = s.indexOf(q, i + 1);
            j = j < 0 || j + 1 > end ? end : j + 1;
            emit("string", i, j);
            i = j;
          } else {
            let j = i;
            while (j < end && !isSpace(s.charCodeAt(j)) && s[j] !== ">" && !(s[j] === "/" && s[j + 1] === ">")) j++;
            emit("string", i, j);
            i = j;
          }
          continue;
        }
        let j = i + 1;
        while (j < end) {
          const k = s[j]!;
          if (isSpace(s.charCodeAt(j)) || k === "=" || k === ">" || k === "<" || k === '"' || k === "'" || (k === "/" && s[j + 1] === ">")) break;
          j++;
        }
        emit("attr", i, j);
        i = j;
      }
      if (!closing && !selfClose && (name === "script" || name === "style")) {
        const re = new RegExp(`</${name}`, "gi");
        re.lastIndex = i;
        const m = re.exec(s);
        const j = m && m.index < end ? m.index : end;
        if (name === "script") scanJs(s, i, j, emit, false);
        else scanCss(s, i, j, emit);
        i = j;
      }
    } else if (c === "{" && n === "{") {
      emit("punctuation", i, i + 2);
      const j = s.indexOf("}}", i + 2);
      if (j >= 0 && j <= end) {
        scanJs(s, i + 2, j, emit, false);
        emit("punctuation", j, j + 2);
        i = j + 2;
      } else i += 2;
    } else if (c === "@" && sticky(HTML_FLOW, s, i) > i) {
      const j = sticky(HTML_FLOW, s, i);
      emit("keyword", i, j);
      i = j;
    } else i++;
  }
}

const SH_KEYWORDS = words("if then else elif fi for in do done while until case esac function select return exit break continue local export readonly declare typeset unset time");
const SH_RESET = words("if then else elif do while until time ! { ( && || |");

function scanBash(s: string, end: number, emit: Emit): void {
  let i = 0;
  let cmd = true;
  while (i < end) {
    const code = s.charCodeAt(i);
    if (code === 10) {
      cmd = true;
      i++;
      continue;
    }
    if (isSpace(code)) {
      i++;
      continue;
    }
    const c = s[i]!;
    if (c === "#") {
      let j = s.indexOf("\n", i);
      if (j < 0) j = end;
      emit("comment", i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < end && s[j] !== c) j += c === '"' && s[j] === "\\" ? 2 : 1;
      j = Math.min(j + 1, end);
      emit("string", i, j);
      cmd = false;
      i = j;
    } else if (c === "$") {
      const n = s[i + 1];
      if (n === "{") {
        let j = i + 2;
        while (j < end && s[j] !== "}" && s[j] !== "\n") j++;
        j = s[j] === "}" ? j + 1 : j;
        emit("property", i, j);
        i = j;
        cmd = false;
      } else if (n === "(") {
        emit("punctuation", i, i + 2);
        i += 2;
        cmd = true;
      } else {
        const j = sticky(/\$(?:[A-Za-z_]\w*|[0-9?@*#!$-])/y, s, i);
        const e = j > i ? Math.min(j, end) : i + 1;
        emit(j > i ? "property" : "punctuation", i, e);
        i = e;
        cmd = false;
      }
    } else if (c === "|" || c === "&" || c === ";" || c === "(") {
      const two = (c === "|" || c === "&") && s[i + 1] === c ? 2 : 1;
      emit("punctuation", i, i + two);
      cmd = true;
      i += two;
    } else if (c === "<" || c === ">" || c === ")" || c === "`") {
      emit("punctuation", i, i + 1);
      if (c === "`") cmd = true;
      i++;
    } else {
      const j = Math.min(sticky(/[^\s'"`$|&;<>()]+/y, s, i), end);
      const e = j > i ? j : i + 1;
      const w = s.slice(i, e);
      const assign = /^[A-Za-z_]\w*\+?=/.exec(w);
      if (assign) {
        const nameEnd = i + assign[0].length - 1;
        emit("property", i, nameEnd);
        emit("punctuation", nameEnd, nameEnd + 1);
        if (/^\d+$/.test(w.slice(assign[0].length))) emit("number", nameEnd + 1, e);
      } else if (w === "{" || w === "}") {
        emit("punctuation", i, e);
        cmd = w === "{";
      } else if (w.length > 1 && w[0] === "-" && !cmd) emit("attr", i, e);
      else if (SH_KEYWORDS.has(w) && (cmd || w === "in" || w === "do" || w === "then")) {
        emit("keyword", i, e);
        cmd = SH_RESET.has(w);
      } else if (/^\d+$/.test(w)) {
        emit("number", i, e);
        cmd = false;
      } else if (cmd) {
        emit("function", i, e);
        cmd = false;
      }
      i = e;
    }
  }
}

function scan(code: string, lang: BuiltinLanguage, emit: Emit): void {
  const end = code.length;
  switch (lang) {
    case "ts":
    case "js":
      return scanJs(code, 0, end, emit, false);
    case "tsx":
    case "jsx":
      return scanJs(code, 0, end, emit, true);
    case "json":
      return scanJson(code, end, emit);
    case "html":
      return scanHtml(code, 0, end, emit);
    case "css":
      return scanCss(code, 0, end, emit);
    case "bash":
      return scanBash(code, end, emit);
    default:
      return;
  }
}

/** Splits `code` into lines (on `\n`; a `\r` stays at the end of its line) of tokens. Multi-line tokens carry over. */
export function tokenize(code: string, language: string = "text"): Token[][] {
  const src = String(code ?? "");
  const spans: Span[] = [];
  let pos = 0;
  const emit: Emit = (kind, a, b) => {
    const start = Math.max(a, pos);
    const stop = Math.min(b, src.length);
    if (stop <= start) return;
    spans.push([kind, start, stop]);
    pos = stop;
  };
  try {
    scan(src, normalizeLanguage(language), emit);
  } catch {
    spans.length = 0;
  }

  const newlines: number[] = [];
  for (let i = src.indexOf("\n"); i >= 0; i = src.indexOf("\n", i + 1)) newlines.push(i);
  const lines: Token[][] = [[]];
  let nl = 0;
  const add = (kind: TokenKind, a: number, b: number) => {
    while (a < b) {
      while (nl < newlines.length && newlines[nl]! < a) nl++;
      const at = nl < newlines.length ? newlines[nl]! : -1;
      if (at < 0 || at >= b) {
        push(kind, a, b);
        return;
      }
      if (at > a) push(kind, a, at);
      lines.push([]);
      a = at + 1;
    }
  };
  const push = (kind: TokenKind, a: number, b: number) => {
    const line = lines[lines.length - 1]!;
    const last = line[line.length - 1];
    const text = src.slice(a, b);
    if (last && last.kind === kind) last.text += text;
    else line.push({ text, kind });
  };
  let at = 0;
  for (const [kind, a, b] of spans) {
    add("plain", at, a);
    add(kind, a, b);
    at = b;
  }
  add("plain", at, src.length);
  return lines;
}
