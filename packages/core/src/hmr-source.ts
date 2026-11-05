// Dev only. Tells what kind of edit turned one version of a class into the next, from the class's own source text.
// No parsing of Gable's templates and no probe instantiation: methods are cut out by their exact text, `static`
// members (meta, hmr, ...) are compared separately, and whatever is left is the Setup (field initialisers).

export interface Definition {
  /** Class header plus instance field initialisers, whitespace-normalised. A change here means re-setup. */
  setup: string;
  /** Method, accessor and static-method sources. A change here alone is patched in place. */
  members: string;
  /** Private `#names` make patched methods unusable on old instances, so a members-only edit must re-set-up. */
  hasPrivate: boolean;
}

const SKIP = new Set<PropertyKey>(["length", "name", "prototype", "caller", "arguments"]);

export function ownMembers(Class: Function): Array<[PropertyKey, PropertyDescriptor, boolean]> {
  const out: Array<[PropertyKey, PropertyDescriptor, boolean]> = [];
  for (const key of Reflect.ownKeys(Class.prototype)) if (key !== "constructor") out.push([key, Object.getOwnPropertyDescriptor(Class.prototype, key)!, false]);
  for (const key of Reflect.ownKeys(Class)) if (!SKIP.has(key)) out.push([key, Object.getOwnPropertyDescriptor(Class, key)!, true]);
  return out;
}

export function describe(Class: Function): Definition {
  let source = Function.prototype.toString.call(Class);
  const texts: string[] = [];
  const members: string[] = [];
  for (const [key, d, isStatic] of ownMembers(Class)) {
    for (const fn of [d.value, d.get, d.set]) {
      if (typeof fn !== "function" || /^class[\s{]/.test(Function.prototype.toString.call(fn))) continue;
      const text = Function.prototype.toString.call(fn);
      texts.push(text);
      members.push(`${isStatic ? "static " : ""}${String(key)}=${text}`);
    }
  }
  for (const text of texts.sort((a, b) => b.length - a.length)) source = source.replace(text, "");
  const open = source.indexOf("{");
  const header = source.slice(0, open);
  const body = source.slice(open + 1, source.lastIndexOf("}"));
  const setup = splitStatements(body).filter((s) => !/^\s*static\b/.test(s)).map(squash).join(";");
  return { setup: squash(header) + "|" + setup, members: members.sort().join("\n"), hasPrivate: /(^|[^\w$])#[A-Za-z_$]/.test(Function.prototype.toString.call(Class)) };
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function skipString(s: string, i: number, quote: string): number {
  for (i++; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === quote) return i + 1;
  }
  return i;
}

function skipTemplate(s: string, i: number): number {
  for (i++; i < s.length; ) {
    if (s[i] === "\\") i += 2;
    else if (s[i] === "`") return i + 1;
    else if (s[i] === "$" && s[i + 1] === "{") i = skipBraces(s, i + 1);
    else i++;
  }
  return i;
}

function skipBraces(s: string, i: number): number {
  let depth = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'") i = skipString(s, i, c);
    else if (c === "`") i = skipTemplate(s, i);
    else {
      i++;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) return i;
    }
  }
  return i;
}

/** Splits a class body at top-level semicolons, ignoring strings, templates and comments. */
function splitStatements(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i]!;
    if (c === '"' || c === "'") i = skipString(body, i, c);
    else if (c === "`") i = skipTemplate(body, i);
    else if (c === "/" && body[i + 1] === "/") i = body.indexOf("\n", i) < 0 ? body.length : body.indexOf("\n", i);
    else if (c === "/" && body[i + 1] === "*") i = body.indexOf("*/", i + 2) < 0 ? body.length : body.indexOf("*/", i + 2) + 2;
    else {
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === ";" && depth === 0) {
        out.push(body.slice(start, i));
        start = i + 1;
      }
      i++;
    }
  }
  out.push(body.slice(start));
  return out;
}
