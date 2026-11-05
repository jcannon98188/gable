/**
 * A small scanner that locates tagged template literals (`html`...``) without the TypeScript compiler API.
 * It understands comments, string and template literals (with nested `${}`), and uses the previous
 * significant token to tell regex literals from division. It is deliberately not a full JS lexer.
 */

export interface TemplateLiteralSpan {
  /** Index of the first tag character. */
  tagStart: number;
  /** Index just after the opening backtick. */
  open: number;
  /** Index of the closing backtick. */
  close: number;
}

const REGEX_AFTER_WORD = new Set("return typeof case in of delete void throw new else do yield await instanceof".split(" "));

export function findHtmlLiterals(src: string, tag = "html"): TemplateLiteralSpan[] {
  const found: TemplateLiteralSpan[] = [];
  let i = 0;

  /** Scans code until EOF, or (inHole) until the `}` closing the hole. Returns the index of that `}` or EOF. */
  const code = (inHole: boolean, collect: boolean): number => {
    let depth = 0;
    let prev = ""; // last significant char
    let prevWord = "";
    while (i < src.length) {
      const c = src[i]!;
      if (c === "/" && src[i + 1] === "/") {
        const nl = src.indexOf("\n", i);
        i = nl === -1 ? src.length : nl;
      } else if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end === -1 ? src.length : end + 2;
      } else if (c === '"' || c === "'") {
        i++;
        while (i < src.length && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
        i++;
        prev = c;
        prevWord = "";
      } else if (c === "`") {
        const isTagged = src.startsWith(tag, i - tag.length) && !/[\w$.]/.test(src[i - tag.length - 1] ?? " ");
        const start = i;
        i++;
        template(collect && !isTagged);
        if (isTagged && collect) found.push({ tagStart: start - tag.length, open: start + 1, close: i });
        i++;
        prev = "`";
        prevWord = "";
      } else if (c === "/") {
        const regex = prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || REGEX_AFTER_WORD.has(prevWord);
        if (regex) {
          i++;
          let inClass = false;
          while (i < src.length && src[i] !== "\n") {
            const d = src[i]!;
            if (d === "\\") i++;
            else if (d === "[") inClass = true;
            else if (d === "]") inClass = false;
            else if (d === "/" && !inClass) break;
            i++;
          }
          i++;
          while (/[a-z]/i.test(src[i] ?? "")) i++;
          prev = "/";
          prevWord = "";
        } else {
          i++;
          prev = "/";
          prevWord = "";
        }
      } else if (/[\w$]/.test(c)) {
        const m = /^[\w$]+/.exec(src.slice(i, i + 64))!;
        i += m[0].length;
        prev = "a";
        prevWord = m[0];
      } else {
        if (c === "{") depth++;
        else if (c === "}") {
          if (inHole && depth === 0) return i;
          depth--;
        }
        if (!/\s/.test(c)) {
          prev = c;
          prevWord = "";
        }
        i++;
      }
    }
    return i;
  };

  /** Scans a template body; leaves `i` on the closing backtick. */
  const template = (collect: boolean): void => {
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\\") i += 2;
      else if (c === "`") return;
      else if (c === "$" && src[i + 1] === "{") {
        i += 2;
        code(true, collect);
        i++; // the closing }
      } else i++;
    }
  };

  code(false, true);
  return found;
}
