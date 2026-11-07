// A small scanner for TS/JS source that finds the template literals the i18n build cares about:
// html`...` (static Gable templates) and i18n`...` (the tag for messages in code). It understands strings, comments,
// regex literals and nested template literals, so a backtick inside any of those is not mistaken for a template.

export interface TemplateHit {
  tag: "html" | "i18n";
  /** Offset of the tag identifier. */
  tagStart: number;
  /** Offset just after the opening backtick. */
  start: number;
  /** Offset of the closing backtick. */
  end: number;
  /** Source spans of the `${ }` expressions (without the delimiters), in order. */
  holes: Array<{ start: number; end: number }>;
  /** Raw text of each literal piece (`holes.length + 1` of them). */
  raw: string[];
}

const IDENT_END = /[A-Za-z_$][\w$]*$/;
const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export function scanTemplates(code: string, tags: readonly ("html" | "i18n")[] = ["html", "i18n"]): TemplateHit[] {
  const hits: TemplateHit[] = [];
  let i = 0;

  const prevSignificant = (from: number): string => {
    let p = from - 1;
    while (p >= 0 && /\s/.test(code[p]!)) p--;
    return p < 0 ? "" : code[p]!;
  };
  const prevWord = (from: number): string => {
    let p = from - 1;
    while (p >= 0 && /\s/.test(code[p]!)) p--;
    return /[A-Za-z]+$/.exec(code.slice(Math.max(0, p - 10), p + 1))?.[0] ?? "";
  };

  const skipString = (quote: string) => {
    i++;
    while (i < code.length && code[i] !== quote) i += code[i] === "\\" ? 2 : 1;
    i++;
  };

  const skipRegex = () => {
    i++;
    let inClass = false;
    while (i < code.length) {
      const c = code[i]!;
      if (c === "\\") i++;
      else if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      else if (c === "\n") break;
      i++;
    }
    i++;
  };

  /** At a backtick. Records a hit for a recognised tag, and always consumes the whole literal. */
  const template = () => {
    const before = code.slice(Math.max(0, i - 40), i);
    const ident = IDENT_END.exec(before)?.[0];
    const identStart = ident ? i - ident.length : -1;
    const tagged = ident !== undefined && (tags as readonly string[]).includes(ident) && !/[.\w$]/.test(code[identStart - 1] ?? "");
    const start = i + 1;
    const holes: Array<{ start: number; end: number }> = [];
    const raw: string[] = [];
    let pieceStart = start;
    i++;
    while (i < code.length && code[i] !== "`") {
      if (code[i] === "\\") i += 2;
      else if (code[i] === "$" && code[i + 1] === "{") {
        raw.push(code.slice(pieceStart, i));
        const exprStart = i + 2;
        i = exprStart;
        code_(true);
        holes.push({ start: exprStart, end: i });
        i++; // the closing brace
        pieceStart = i;
      } else i++;
    }
    raw.push(code.slice(pieceStart, i));
    if (tagged) hits.push({ tag: ident as "html" | "i18n", tagStart: identStart, start, end: i, holes, raw });
    i++;
  };

  /** Scans code; with `untilBrace` stops at the unmatched `}` (left at `i`). */
  const code_ = (untilBrace: boolean) => {
    let depth = 0;
    while (i < code.length) {
      const c = code[i]!;
      if (c === '"' || c === "'") skipString(c);
      else if (c === "`") template();
      else if (c === "/" && code[i + 1] === "/") {
        while (i < code.length && code[i] !== "\n") i++;
      } else if (c === "/" && code[i + 1] === "*") {
        const close = code.indexOf("*/", i + 2);
        i = close === -1 ? code.length : close + 2;
      } else if (c === "/") {
        const prev = prevSignificant(i);
        if (prev === "" || REGEX_PREV.has(prev) || /^(?:return|typeof|case|void|delete|in|of)$/.test(prevWord(i))) skipRegex();
        else i++;
      } else if (c === "{") {
        depth++;
        i++;
      } else if (c === "}") {
        if (untilBrace && depth === 0) return;
        depth--;
        i++;
      } else i++;
    }
  };

  code_(false);
  return hits.sort((a, b) => a.start - b.start);
}

/** 1-based line of an offset. */
export function lineOf(code: string, offset: number): number {
  let line = 1;
  for (let p = code.indexOf("\n"); p !== -1 && p < offset; p = code.indexOf("\n", p + 1)) line++;
  return line;
}

/** The cooked value of a template piece (what the `strings` array holds). */
export function cook(raw: string): string {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|[\s\S])/g, (_, e: string) => {
    switch (e[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0": return e.length === 1 ? "\0" : e;
      case "x": return e.length === 3 ? String.fromCharCode(parseInt(e.slice(1), 16)) : e;
      case "u": return e[1] === "{" ? String.fromCodePoint(parseInt(e.slice(2, -1), 16)) : e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : e;
      case "\n":
      case "\r": return "";
      default: return e;
    }
  });
}
