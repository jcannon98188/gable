/** At-rules whose body holds ordinary rules that need scoping too. Every other at-rule is copied through. */
const NESTING_AT_RULES = new Set(["media", "supports", "container", "layer", "document", "scope"]);

/** Index of the character after a quoted string starting at `i`. */
function skipString(css: string, i: number): number {
  const quote = css[i];
  for (i++; i < css.length && css[i] !== quote; i++) if (css[i] === "\\") i++;
  return i + 1;
}

/** Index just past the `}` matching the `{` at `open`. */
function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") i = skipString(css, i) - 1;
    else if (c === "/" && css[i + 1] === "*") i = css.indexOf("*/", i + 2) + 1 || css.length;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i + 1;
  }
  return css.length;
}

/** Splits at commas that are not inside parentheses, brackets or strings. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '"' || c === "'") i = skipString(list, i) - 1;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

const PSEUDO_ELEMENT = /::|:(?:before|after|first-line|first-letter)\b/;

/** Adds `[token]` to the last compound selector, before any pseudo-element. */
function scopeCompound(selector: string, token: string): string {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c!)) last = i + 1;
  }
  const compound = selector.slice(last);
  const pseudo = compound.search(PSEUDO_ELEMENT);
  const at = last + (pseudo < 0 ? compound.length : pseudo);
  return `${selector.slice(0, at)}[${token}]${selector.slice(at)}`;
}

function scopeSelector(selector: string, token: string): string {
  const host = /^:host(?:\(((?:[^()]|\([^()]*\))*)\))?/.exec(selector);
  if (!host) return scopeCompound(selector, token);
  const rest = selector.slice(host[0].length);
  const head = `[${token}]${host[1] ?? ""}`;
  return rest.trim() === "" ? head : head + scopeCompound(rest, token);
}

/** Rewrites `css` so every rule only matches elements carrying the `token` attribute; `:host` matches the component host. */
export function scopeCss(css: string, token: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (/\s/.test(css[i]!)) {
      out += css[i++];
      continue;
    }
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    // A prelude runs to the next `{` or `;` outside strings and parentheses.
    let j = i;
    let depth = 0;
    for (; j < css.length; j++) {
      const c = css[j];
      if (c === '"' || c === "'") j = skipString(css, j) - 1;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      else if ((c === "{" || c === ";") && depth === 0) break;
    }
    const prelude = css.slice(i, j);
    if (css[j] !== "{") {
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const end = closingBrace(css, j);
    const body = css.slice(j + 1, end - 1);
    const at = /^@([\w-]+)/.exec(prelude);
    if (at) {
      const name = at[1]!.toLowerCase();
      out += `${prelude}{${NESTING_AT_RULES.has(name) ? scopeCss(body, token) : body}}`;
    } else {
      const trailing = /\s*$/.exec(prelude)![0];
      out += `${splitSelectors(prelude).map((s) => scopeSelector(s, token)).join(", ")}${trailing}{${body}}`;
    }
    i = end;
  }
  return out;
}
