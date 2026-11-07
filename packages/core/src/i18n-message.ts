// The message core of i18n: pure, DOM-free and signal-free, so build tooling (the Vite plugin's extractor and
// baked builds) can import it from `@gable/core/i18n` without pulling in the runtime. It parses ICU-style messages,
// formats them on Intl, derives stable message ids, and reads and writes catalogs (JSON, and XLIFF 1.2).

// --- message syntax --------------------------------------------------------

export type MessageNode =
  | string
  | { kind: "arg"; name: string }
  | { kind: "number"; name: string; style: string }
  | { kind: "date"; name: string; style: string }
  | { kind: "time"; name: string; style: string }
  | { kind: "plural"; name: string; offset: number; cases: Record<string, MessageNode[]> }
  | { kind: "selectordinal"; name: string; offset: number; cases: Record<string, MessageNode[]> }
  | { kind: "select"; name: string; cases: Record<string, MessageNode[]> }
  | { kind: "pound" };

export class MessageSyntaxError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly at: number,
  ) {
    super(`${message} at ${at} in message ${JSON.stringify(source)}`);
    this.name = "MessageSyntaxError";
  }
}

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

/**
 * Parses a message. Syntax: text with `{name}` / `{0}` placeholders, `{n, number[, style]}`, `{d, date[, style]}`,
 * `{d, time[, style]}`, `{n, plural, offset:1 =0 {..} one {# item} other {# items}}`, `{n, selectordinal, ...}` and
 * `{x, select, a {..} other {..}}`. `#` inside a plural branch is the (offset-adjusted) number. A backslash escapes
 * `\{`, `\}`, `\#` and `\\`; any other backslash is literal. Plural and select need an `other` branch.
 */
export function parseMessage(source: string): MessageNode[] {
  const cached = parsed.get(source);
  if (cached) return cached;
  const p = new MessageParser(source);
  const nodes = p.parseNodes(false, false);
  if (p.i < source.length) throw new MessageSyntaxError("Unmatched }", source, p.i);
  if (parsed.size > 5000) parsed.clear();
  parsed.set(source, nodes);
  return nodes;
}

const parsed = new Map<string, MessageNode[]>();

class MessageParser {
  i = 0;
  constructor(readonly s: string) {}

  /** Parses until the end of the source, or (inside a branch) the closing `}`, which is left unconsumed. */
  parseNodes(inBranch: boolean, inPlural: boolean): MessageNode[] {
    const out: MessageNode[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push(text);
      text = "";
    };
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i]!;
      if (c === "\\" && /[{}#\\]/.test(s[this.i + 1] ?? "")) {
        text += s[this.i + 1];
        this.i += 2;
      } else if (c === "}") {
        if (inBranch) break;
        throw new MessageSyntaxError("Unmatched }", s, this.i);
      } else if (c === "{") {
        flush();
        out.push(this.parseArgument(inPlural));
      } else if (c === "#" && inPlural) {
        flush();
        out.push({ kind: "pound" });
        this.i++;
      } else {
        text += c;
        this.i++;
      }
    }
    flush();
    return out;
  }

  private skipSpace(): void {
    while (/\s/.test(this.s[this.i] ?? "")) this.i++;
  }

  private word(stop: RegExp): string {
    const start = this.i;
    while (this.i < this.s.length && !stop.test(this.s[this.i]!)) this.i++;
    return this.s.slice(start, this.i).trim();
  }

  private parseArgument(inPlural: boolean): MessageNode {
    const s = this.s;
    const open = this.i;
    this.i++; // {
    const name = this.word(/[,}]/);
    if (this.i >= s.length) throw new MessageSyntaxError("Unterminated {", s, open);
    if (!name) throw new MessageSyntaxError("Empty placeholder", s, open);
    if (s[this.i] === "}") {
      this.i++;
      return { kind: "arg", name };
    }
    this.i++; // ,
    const type = this.word(/[,}]/);
    if (this.i >= s.length) throw new MessageSyntaxError("Unterminated {", s, open);
    switch (type) {
      case "number":
      case "date":
      case "time": {
        let style = "";
        if (s[this.i] === ",") {
          this.i++;
          style = this.word(/[}]/);
        }
        if (s[this.i] !== "}") throw new MessageSyntaxError("Unterminated {", s, open);
        this.i++;
        return type === "number" ? { kind: "number", name, style } : type === "date" ? { kind: "date", name, style } : { kind: "time", name, style };
      }
      case "plural":
      case "selectordinal":
      case "select": {
        if (s[this.i] !== ",") throw new MessageSyntaxError(`${type} needs branches after a comma`, s, this.i);
        this.i++;
        let offset = 0;
        this.skipSpace();
        if (type !== "select") {
          const m = /^offset:\s*(\d+)/.exec(s.slice(this.i));
          if (m) {
            offset = Number(m[1]);
            this.i += m[0].length;
          }
        }
        const cases: Record<string, MessageNode[]> = {};
        for (;;) {
          this.skipSpace();
          if (this.i >= s.length) throw new MessageSyntaxError("Unterminated {", s, open);
          if (s[this.i] === "}") break;
          const selector = this.word(/[\s{}]/);
          if (!selector) throw new MessageSyntaxError(`Expected a branch selector in ${type}`, s, this.i);
          if (type !== "select" && !(PLURAL_CATEGORIES.has(selector) || /^=\d+$/.test(selector))) {
            throw new MessageSyntaxError(`"${selector}" is not a plural category (zero, one, two, few, many, other) or =N`, s, this.i);
          }
          this.skipSpace();
          if (s[this.i] !== "{") throw new MessageSyntaxError(`Expected { after "${selector}"`, s, this.i);
          this.i++;
          cases[selector] = this.parseNodes(true, type === "select" ? inPlural : true);
          if (s[this.i] !== "}") throw new MessageSyntaxError(`Unterminated branch "${selector}"`, s, this.i);
          this.i++;
        }
        if (this.i >= s.length) throw new MessageSyntaxError("Unterminated {", s, open);
        this.i++; // }
        if (!("other" in cases)) throw new MessageSyntaxError(`${type} on "${name}" needs an "other" branch`, s, open);
        return type === "select" ? { kind: "select", name, cases } : type === "plural" ? { kind: "plural", name, offset, cases } : { kind: "selectordinal", name, offset, cases };
      }
      default:
        throw new MessageSyntaxError(`Unknown argument type "${type}" (number, date, time, plural, selectordinal, select)`, s, open);
    }
  }
}

/** Escapes literal text for use in a message: `\`, `{` and `}` get a backslash. */
export function escapeMessageText(text: string): string {
  return text.replace(/[\\{}]/g, "\\$&");
}

/** The placeholder names a message refers to (top level and inside branches), in first-use order. */
export function messageArguments(source: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: MessageNode[]) => {
    for (const n of nodes) {
      if (typeof n === "string" || n.kind === "pound") continue;
      names.add(n.name);
      if ("cases" in n) for (const branch of Object.values(n.cases)) walk(branch);
    }
  };
  walk(parseMessage(source));
  return [...names];
}

// --- formatting ------------------------------------------------------------

export type MessageArgs = readonly unknown[] | Readonly<Record<string, unknown>>;

const intlCache = new Map<string, unknown>();
function intl<T>(kind: string, locale: string, options: object | undefined, make: (locale: string, options?: any) => T): T {
  const key = `${kind}|${locale}|${options ? JSON.stringify(options) : ""}`;
  let value = intlCache.get(key) as T | undefined;
  if (!value) {
    try {
      value = make(locale, options);
    } catch {
      value = make("en", options);
    }
    if (intlCache.size > 200) intlCache.clear();
    intlCache.set(key, value);
  }
  return value;
}

/** Formats `source` for `locale`. Missing placeholders render as empty text. */
export function formatMessage(source: string | readonly MessageNode[], args: MessageArgs = [], locale = "en"): string {
  const nodes = typeof source === "string" ? parseMessage(source) : source;
  return render(nodes, args as Record<string, unknown>, locale, null);
}

function render(nodes: readonly MessageNode[], args: Record<string, unknown>, locale: string, pound: string | null): string {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") out += n;
    else if (n.kind === "pound") out += pound ?? "#";
    else if (n.kind === "arg") out += plain(args[n.name]);
    else if (n.kind === "number") out += formatNumber(args[n.name], n.style, locale);
    else if (n.kind === "date" || n.kind === "time") out += formatDate(args[n.name], n.kind, n.style, locale);
    else if (n.kind === "select") {
      const key = plain(args[n.name]);
      out += render(Object.hasOwn(n.cases, key) ? n.cases[key]! : n.cases.other!, args, locale, pound);
    } else {
      const value = Number(args[n.name]);
      const adjusted = value - n.offset;
      const exact = n.cases[`=${value}`];
      let branch = exact;
      if (!branch) {
        const category = Number.isNaN(adjusted)
          ? "other"
          : intl("plural" + n.kind, locale, { type: n.kind === "plural" ? "cardinal" : "ordinal" }, (l, o) => new Intl.PluralRules(l, o)).select(adjusted);
        branch = n.cases[category] ?? n.cases.other!;
      }
      const shown = intl("number", locale, undefined, (l) => new Intl.NumberFormat(l)).format(adjusted);
      out += render(branch, args, locale, shown);
    }
  }
  return out;
}

function plain(value: unknown): string {
  return value == null ? "" : String(value);
}

function formatNumber(value: unknown, style: string, locale: string): string {
  const n = Number(value);
  if (value == null || Number.isNaN(n)) return plain(value);
  let options: Intl.NumberFormatOptions | undefined;
  if (style === "integer") options = { maximumFractionDigits: 0 };
  else if (style === "percent") options = { style: "percent" };
  else if (style === "compact") options = { notation: "compact" };
  else if (style.startsWith("currency:")) options = { style: "currency", currency: style.slice(9).trim().toUpperCase() };
  return intl("number", locale, options, (l, o) => new Intl.NumberFormat(l, o)).format(n);
}

function formatDate(value: unknown, kind: "date" | "time", style: string, locale: string): string {
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (value == null || Number.isNaN(d.getTime())) return plain(value);
  const length = (["short", "medium", "long", "full"] as const).find((x) => x === style) ?? "medium";
  const options: Intl.DateTimeFormatOptions = kind === "date" ? { dateStyle: length } : { timeStyle: length };
  return intl("date", locale, options, (l, o) => new Intl.DateTimeFormat(l, o)).format(d);
}

// --- ids and markers -------------------------------------------------------

/**
 * The stable id of a message: the 64-bit FNV-1a hash of the UTF-8 bytes of `source + "\u0000" + description`,
 * written as 16 lowercase hex digits. `source` is the message exactly as extracted (placeholders `{0}`, `{1}`... in
 * order of appearance, whitespace collapsed); `description` is empty when there is none. Everything that
 * extracts messages (the runtime parser, the language service, the Vite plugin) goes through this function.
 */
export function messageId(source: string, description = ""): string {
  const bytes = new TextEncoder().encode(`${source}\u0000${description}`);
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (const b of bytes) hash = ((hash ^ BigInt(b)) * prime) & mask;
  return hash.toString(16).padStart(16, "0");
}

/** What an `i18n` marker value says: `"description"`, `"description@@id"`, `"@@id"` or empty. */
export interface Marker {
  description: string;
  /** An explicit id (`@@id`); the derived id is used when absent. */
  id?: string;
}

export function parseMarker(value: string): Marker {
  const at = value.indexOf("@@");
  if (at === -1) return { description: value.trim() };
  const id = value.slice(at + 2).trim();
  if (!id) throw new Error(`Empty id after "@@" in i18n marker ${JSON.stringify(value)}`);
  return { description: value.slice(0, at).trim(), id };
}

/** One translatable message, as extraction reports it. */
export interface ExtractedMessage {
  id: string;
  /** The source-language message: ICU syntax, `{0}`-style placeholders. */
  message: string;
  description: string;
  /** What each placeholder stands for, by index: the expression text from the template (`user.name`), for translators. */
  placeholders: string[];
  /** Where it came from, when the extractor knows (`file:line`). */
  location?: string;
}

/** Builds the message of a template text run: static pieces escaped, each expression a numbered placeholder, whitespace collapsed. */
export function messageFromParts(parts: readonly (string | { placeholder: true })[]): string {
  let n = 0;
  let out = "";
  for (const part of parts) out += typeof part === "string" ? escapeMessageText(part) : `{${n++}}`;
  return out.replace(/\s+/g, " ").trim();
}

/**
 * The message of a tagged template call (`i18n\`Hello ${name}\``). A leading `:description@@id:` block in the first
 * string is metadata, as in `$localize` (write `\:` for a literal colon at the start).
 */
export function messageFromStrings(strings: readonly string[], raw: readonly string[] = strings): { message: string; marker: Marker } {
  let first = strings[0]!;
  let marker: Marker = { description: "" };
  const rawFirst = raw[0] ?? first;
  if (rawFirst.startsWith(":")) {
    const end = rawFirst.indexOf(":", 1);
    if (end !== -1) {
      marker = parseMarker(rawFirst.slice(1, end));
      first = rawFirst.slice(end + 1);
    }
  }
  let out = escapeMessageText(first);
  for (let i = 1; i < strings.length; i++) out += `{${i - 1}}` + escapeMessageText(strings[i]!);
  return { message: out.replace(/\s+/g, " ").trim(), marker };
}

// --- catalogs --------------------------------------------------------------

/** A translation catalog: message id to translated message. */
export type Messages = Readonly<Record<string, string>>;

/** The JSON file form of a catalog. A bare `{ id: message }` object is accepted too. */
export interface CatalogFile {
  locale?: string;
  translations: Messages;
}

/** Reads a parsed JSON catalog (either shape) into a map of messages. Throws on anything that is not strings. */
export function readCatalog(json: unknown): { locale?: string; messages: Messages } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error("A catalog must be a JSON object");
  const file = json as Record<string, unknown>;
  const wrapped = typeof file.translations === "object" && file.translations !== null && !Array.isArray(file.translations);
  const messages = (wrapped ? file.translations : file) as Record<string, unknown>;
  for (const [id, message] of Object.entries(messages)) {
    if (typeof message !== "string") throw new Error(`Catalog entry "${id}" must be a string`);
  }
  const locale = wrapped && typeof file.locale === "string" ? file.locale : undefined;
  return locale === undefined ? { messages: messages as Messages } : { locale, messages: messages as Messages };
}

/**
 * Merges extraction results into a stable list: first occurrence of an id wins (its locations are joined), sorted by id.
 * Two different messages sharing an explicit id are reported through `conflict`.
 */
export function mergeExtracted(messages: readonly ExtractedMessage[], conflict?: (a: ExtractedMessage, b: ExtractedMessage) => void): ExtractedMessage[] {
  const byId = new Map<string, ExtractedMessage>();
  for (const m of messages) {
    const seen = byId.get(m.id);
    if (!seen) byId.set(m.id, { ...m });
    else {
      if (seen.message !== m.message) conflict?.(seen, m);
      if (m.location && seen.location && !seen.location.split(", ").includes(m.location)) seen.location += `, ${m.location}`;
      else if (m.location && !seen.location) seen.location = m.location;
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The source-language catalog of extracted messages as JSON text: what translators start from. */
export function sourceCatalogJson(messages: readonly ExtractedMessage[], locale: string): string {
  const translations: Record<string, string> = {};
  for (const m of mergeExtracted(messages)) translations[m.id] = m.message;
  return JSON.stringify({ locale, translations } satisfies CatalogFile, null, 2) + "\n";
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const xmlUnescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

/** XLIFF 1.2 for translators: one `trans-unit` per message, with the translation as `target` when `translations` has one. */
export function toXliff(messages: readonly ExtractedMessage[], options: { sourceLocale: string; targetLocale?: string; translations?: Messages }): string {
  const units = mergeExtracted(messages).map((m) => {
    const target = options.translations?.[m.id];
    const notes = [
      m.description && `      <note priority="1" from="description">${xmlEscape(m.description)}</note>`,
      m.location && `      <note priority="1" from="location">${xmlEscape(m.location)}</note>`,
      m.placeholders.length && `      <note priority="2" from="placeholders">${xmlEscape(m.placeholders.map((p, i) => `{${i}} = ${p}`).join("; "))}</note>`,
    ].filter(Boolean);
    return [
      `    <trans-unit id="${xmlEscape(m.id)}" datatype="plaintext">`,
      `      <source>${xmlEscape(m.message)}</source>`,
      target !== undefined ? `      <target>${xmlEscape(target)}</target>` : null,
      ...notes,
      `    </trans-unit>`,
    ]
      .filter((l) => l !== null)
      .join("\n");
  });
  const targetAttr = options.targetLocale ? ` target-language="${xmlEscape(options.targetLocale)}"` : "";
  return [
    `<?xml version="1.0" encoding="UTF-8" ?>`,
    `<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">`,
    `  <file source-language="${xmlEscape(options.sourceLocale)}"${targetAttr} datatype="plaintext" original="ng2.template">`,
    `  <body>`,
    ...units,
    `  </body>`,
    `  </file>`,
    `</xliff>`,
    ``,
  ].join("\n");
}

/** Reads the `target` of each `trans-unit` of an XLIFF 1.2 document into a catalog. Units with no (or an empty) target are left out. */
export function fromXliff(xml: string): { locale?: string; messages: Record<string, string> } {
  const messages: Record<string, string> = {};
  const unit = /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g;
  for (let m = unit.exec(xml); m; m = unit.exec(xml)) {
    const id = /\bid="([^"]*)"/.exec(m[1]!)?.[1];
    const target = /<target\b[^>]*>([\s\S]*?)<\/target>/.exec(m[2]!)?.[1];
    if (id !== undefined && target !== undefined && target !== "") messages[xmlUnescape(id)] = xmlUnescape(target);
  }
  const locale = /<file\b[^>]*\btarget-language="([^"]*)"/.exec(xml)?.[1];
  return locale === undefined ? { messages } : { locale: xmlUnescape(locale), messages };
}
