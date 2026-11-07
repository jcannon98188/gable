// The project's design tokens: CSS custom properties read from its own stylesheets and the package stylesheets they
// `@import` (gable-ui's theme.css, for instance), in cascade order. A definition is classified by its context (document,
// Tailwind `@theme`, a light or dark switch, another theme switch, a component), so each token has a light and a dark value
// and the overrides between them are known. The usage index finds where tokens are read: CSS `var()` in declarations and
// template elements (inline styles, and classes through the project's Tailwind design system), following aliases
// (`--color-primary: var(--primary)`). Everything is read from the files on each change; nothing is kept but a cache.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { findHtmlLiterals, parseTemplateTree } from "@gable/template-format";
import { elementsOf } from "../edit/template.js";
import { sourceText } from "../source.js";
import type { TailwindModel } from "../tailwind/model.js";
import { lineCol, lineText, scanCss, varRefs, type CssFrame, type CssScan } from "./css-scan.js";
import { findToken } from "./patch.js";
import type { ElementToken, TokenDef, TokenInfo, TokenKind, TokenList, TokenScheme, TokenScope, TokenSheet, TokenTarget, TokenUsage, TokenValue } from "./types.js";

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage", "vendor"]);
const MAX_FILES = 3000;

/** Files under the project (not dependencies or build output) whose name passes `want`. */
export function projectFiles(root: string, want: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), depth + 1);
      } else if (want(e.name)) out.push(join(dir, e.name));
    }
  };
  walk(root, 0);
  return out.sort();
}

const isCss = (n: string) => n.endsWith(".css");
const isTemplateSource = (n: string) => /\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(n);

interface Sheet {
  abs: string;
  /** Project-relative path, or the import as written for a package stylesheet. */
  file: string;
  editable: boolean;
  text: string;
  scan: CssScan;
  imports: string[];
  /** The project stylesheet that brings a package stylesheet in (project-relative). */
  importer: string | null;
  /** Stylesheets that do not import one another have no known order between them; overrides are only told within a group. */
  group: number;
}

// --- classifying a context -------------------------------------------------------------------------------------------

const DARK_SEL = /\.dark(?![\w-])|\[data-[\w-]*(?:theme|mode|scheme)[\w-]*=["']?dark["']?\]/i;
const LIGHT_SEL = /\.light(?![\w-])|\[data-[\w-]*(?:theme|mode|scheme)[\w-]*=["']?light["']?\]/i;
const ROOTISH = new Set([":root", "html", ":host", "*", "body", ""]);

export function schemeOf(chain: CssFrame[]): TokenScheme {
  for (const f of chain) {
    if (f.kind === "at") {
      if (/prefers-color-scheme\s*:\s*dark/i.test(f.text) || /^@variant\s+dark\b/.test(f.text)) return "dark";
      if (/prefers-color-scheme\s*:\s*light/i.test(f.text)) return "light";
    } else {
      if (DARK_SEL.test(f.text)) return "dark";
      if (LIGHT_SEL.test(f.text)) return "light";
    }
  }
  return null;
}

export function scopeOf(chain: CssFrame[]): TokenScope {
  if (chain.some((f) => f.kind === "at" && /^@theme\b/.test(f.text))) return "theme";
  const rules = chain.filter((f) => f.kind === "rule");
  if (rules.length === 0) return "root";
  if (rules.length > 1) return "scoped";
  const parts = rules[0]!.text.split(",").map((p) =>
    p
      .replace(/:where\(([^)]*)\)|:is\(([^)]*)\)/g, "$1$2")
      .replace(DARK_SEL, "")
      .replace(LIGHT_SEL, "")
      .trim(),
  );
  if (parts.every((p) => ROOTISH.has(p) || /^(:root|html)$/.test(p))) return "root";
  // A theme switch on the document: an attribute or class on :root/html, or a bare data attribute.
  if (parts.every((p) => /^(:root|html)?(\[data-[^\]]+\]|\.theme-[\w-]+)$/.test(p))) return "variant";
  return "scoped";
}

/** Whether an edit can name the context as at-rules followed by one selector (nested rules are edited in code). */
const flatChain = (chain: CssFrame[]) => {
  const firstRule = chain.findIndex((f) => f.kind === "rule");
  return firstRule === -1 || firstRule === chain.length - 1;
};

const NAMED_COLOR = /^(transparent|currentcolor|black|white|red|green|blue|gray|grey|orange|yellow|purple|pink|teal|cyan|magenta|navy|silver|gold|crimson|tomato|coral|salmon|olive|maroon|lime|aqua|fuchsia|indigo|violet|brown|beige|ivory)$/i;

export function kindOf(value: string): TokenKind {
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v) || /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i.test(v) || NAMED_COLOR.test(v)) return "color";
  if (/^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|svh|dvh|lh)$/.test(v) || /^(calc|clamp|min|max)\(.*\d(px|rem|em|%|vh|vw|ch)/.test(v)) return "length";
  if (/^-?[\d.]+$/.test(v)) return "number";
  return "other";
}

/** A selector for the first element a rule applies to, for jumping to it on the canvas; null when none can be told. */
export function canvasSelector(chain: CssFrame[]): string | null {
  const rules = chain.filter((f) => f.kind === "rule").map((f) => f.text);
  if (rules.length === 0) return null;
  const first = rules.map((r) => r.split(",")[0]!.trim()).join(" ").replace(/\s*&\s*/g, "");
  const s = first
    .replace(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?/g, "")
    .replace(DARK_SEL, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || ROOTISH.has(s) || s === "*") return null;
  return s;
}

// --- reading the stylesheets -----------------------------------------------------------------------------------------

function resolveImport(root: string, from: string, spec: string): string | null {
  if (/^(https?:)?\/\//.test(spec) || spec.startsWith("data:")) return null;
  // Tailwind's own stylesheet is its default theme: Tailwind mode reads it; listing it here would bury the project's tokens.
  if (spec === "tailwindcss" || spec.startsWith("tailwindcss/")) return null;
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const p = spec.startsWith("/") ? join(root, spec) : resolve(dirname(from), spec);
    return existsSync(p) ? p : null;
  }
  const req = createRequire(from);
  try {
    const p = req.resolve(spec);
    if (p.endsWith(".css")) return p;
  } catch {
    // not a plain export: try the package's `style` field
  }
  try {
    const pkg = req.resolve(spec.replace(/\/$/, "") + "/package.json");
    const style = (JSON.parse(readFileSync(pkg, "utf8")) as { style?: string }).style;
    if (style) return join(dirname(pkg), style);
  } catch {
    // unresolvable: skipped
  }
  return null;
}

function insideProject(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return !rel.startsWith("..") && !isAbsolute(rel) && !rel.split(sep).includes("node_modules");
}

const relPath = (root: string, abs: string) => relative(root, abs).split(sep).join("/");

function readSheets(root: string, cssFiles: string[]): Sheet[] {
  const sheets = new Map<string, Sheet>();
  const load = (abs: string, display: string, importer: string | null, depth: number): Sheet | null => {
    const known = sheets.get(abs);
    if (known) return known;
    let text: string;
    try {
      text = readFileSync(abs, "utf8").replaceAll("\r\n", "\n");
    } catch {
      return null;
    }
    const editable = insideProject(root, abs);
    const scan = scanCss(text);
    const sheet: Sheet = { abs, file: editable ? relPath(root, abs) : display, editable, text, scan, imports: [], importer: editable ? null : importer, group: -1 };
    sheets.set(abs, sheet);
    if (depth < 5) {
      for (const imp of scan.imports) {
        const to = resolveImport(root, abs, imp.spec);
        if (!to) continue;
        const child = load(to, editable || !imp.spec.startsWith(".") ? imp.spec : display.replace(/[^/]*$/, "") + imp.spec.replace(/^\.\//, ""), editable ? relPath(root, abs) : importer, depth + 1);
        if (child) sheet.imports.push(child.abs);
      }
    }
    return sheet;
  };
  for (const abs of cssFiles) load(abs, relPath(root, abs), null, 0);

  // Cascade order: each root stylesheet (one no project stylesheet imports) after what it imports, depth first.
  const imported = new Set([...sheets.values()].filter((s) => s.editable).flatMap((s) => s.imports));
  const ordered: Sheet[] = [];
  const seen = new Set<string>();
  const visit = (s: Sheet, group: number) => {
    if (seen.has(s.abs)) return;
    seen.add(s.abs);
    for (const i of s.imports) visit(sheets.get(i)!, group);
    s.group = group;
    ordered.push(s);
  };
  const roots = cssFiles.map((a) => sheets.get(a)).filter((s): s is Sheet => !!s && !imported.has(s.abs));
  roots.forEach((s, i) => visit(s, i));
  for (const s of sheets.values()) visit(s, roots.length);
  return ordered;
}

// --- the index -------------------------------------------------------------------------------------------------------

interface Use {
  /** The custom property read. */
  name: string;
  usage: TokenUsage;
}

export interface TokenIndex {
  list: TokenList;
  byName: Map<string, TokenInfo>;
  usages(name: string): TokenUsage[];
  elementTokens(classes: string, style: string): ElementToken[];
}

const resolveVars = (value: string, lookup: (name: string) => string | null, depth = 0): string =>
  depth > 6
    ? value
    : value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (whole, name: string, fallback?: string) => {
        const v = lookup(name);
        if (v !== null) return resolveVars(v, lookup, depth + 1);
        return fallback !== undefined ? resolveVars(fallback.trim(), lookup, depth + 1) : whole;
      });

export function buildTokenIndex(root: string, model: TailwindModel | null): TokenIndex {
  root = resolve(root);
  const sheets = readSheets(root, projectFiles(root, isCss));
  const sheetOf = new Map(sheets.map((s) => [s.file, s]));

  // Definitions, in cascade order.
  const defs: Array<TokenDef & { group: number; order: number; chain: CssFrame[]; sheet: Sheet }> = [];
  for (const sheet of sheets) {
    for (const d of sheet.scan.decls) {
      if (!d.property.startsWith("--") || d.property.startsWith("--tw-")) continue;
      const chain = sheet.scan.blocks[d.block]!.chain;
      if (chain.some((f) => f.kind === "at" && /^@(keyframes|property|font-face)\b/.test(f.text))) continue;
      const atRules = chain.filter((f) => f.kind === "at").map((f) => f.text);
      const last = chain[chain.length - 1]!;
      const selector = last.kind === "rule" ? chain.filter((f) => f.kind === "rule").map((f) => f.text).join(" ") : null;
      const at = lineCol(sheet.text, d.start);
      defs.push({
        name: d.property,
        value: d.value,
        file: sheet.file,
        line: at.line,
        column: at.column,
        selector,
        atRules,
        context: chain.map((f) => f.text).join(" "),
        scheme: schemeOf(chain),
        scope: scopeOf(chain),
        editable: sheet.editable,
        target: null,
        group: sheet.group,
        order: defs.length,
        chain,
        sheet,
      });
    }
  }
  // Within a group, a later definition in the same context overrides an earlier one.
  const lastIn = new Map<string, (typeof defs)[number]>();
  for (const d of defs) lastIn.set(`${d.group}|${d.name}|${d.context}`, d);
  for (const d of defs) {
    const winner = lastIn.get(`${d.group}|${d.name}|${d.context}`)!;
    if (winner !== d) d.overriddenBy = `${winner.file}:${winner.line}`;
  }

  /** Where an edit of a definition goes: in place in the project's own stylesheet, or as an override in the one that imports it. */
  const targetOf = (d: (typeof defs)[number]): TokenTarget | null => {
    if (!flatChain(d.chain)) return null;
    const file = d.editable ? d.file : d.sheet.importer;
    if (!file) return null;
    const text = d.editable ? d.sheet.text : (sheetOf.get(file)?.text ?? "");
    const found = findToken(text, { name: d.name, selector: d.selector, atRules: d.atRules });
    return { file, selector: d.selector, atRules: d.atRules, expect: found.decl?.value ?? null, override: !d.editable };
  };
  for (const d of defs) d.target = targetOf(d);

  const byNameDefs = new Map<string, typeof defs>();
  for (const d of defs) byNameDefs.set(d.name, [...(byNameDefs.get(d.name) ?? []), d]);
  const isBase = (d: (typeof defs)[number]) => (d.scope === "root" || d.scope === "theme") && d.scheme !== "dark";
  const lightDef = (name: string) => (byNameDefs.get(name) ?? []).filter(isBase).pop() ?? null;
  const darkDef = (name: string) => (byNameDefs.get(name) ?? []).filter((d) => d.scope === "root" && d.scheme === "dark").pop() ?? null;
  const lookupLight = (n: string) => lightDef(n)?.value ?? null;
  const lookupDark = (n: string) => (darkDef(n) ?? lightDef(n))?.value ?? null;

  // The most used dark context: where a token that has no dark value yet gets one.
  const darkChains = new Map<string, { n: number; d: (typeof defs)[number] }>();
  for (const d of defs) {
    if (d.scheme !== "dark" || d.scope !== "root" || !flatChain(d.chain)) continue;
    const key = d.context;
    darkChains.set(key, { n: (darkChains.get(key)?.n ?? 0) + 1, d });
  }
  const darkVia = [...darkChains.entries()].sort((a, b) => b[1].n - a[1].n).map(([k]) => k);

  // --- usages ------------------------------------------------------------------------------------------------------
  const uses: Use[] = [];
  const aliasesOf = new Map<string, Set<string>>();
  for (const sheet of sheets) {
    for (const d of sheet.scan.decls) {
      const refs = varRefs(d.value).filter((r) => !r.startsWith("--tw-"));
      if (refs.length === 0) continue;
      const chain = sheet.scan.blocks[d.block]!.chain;
      if (d.property.startsWith("--")) {
        for (const r of refs) aliasesOf.set(r, new Set([...(aliasesOf.get(r) ?? []), d.property]));
        continue;
      }
      const at = lineCol(sheet.text, d.start);
      for (const name of refs) {
        uses.push({
          name,
          usage: { kind: "css", file: sheet.file, line: at.line, column: at.column, text: lineText(sheet.text, d.start), property: d.property, context: chain.map((f) => f.text).join(" "), selector: canvasSelector(chain), ...(sheet.editable ? {} : { readOnly: true }) },
        });
      }
    }
  }

  const classCache = new Map<string, string[]>();
  const classRefs = (cls: string): string[] => {
    let refs = classCache.get(cls);
    if (!refs) {
      const own = [...varRefs(cls), ...[...cls.matchAll(/\((--[\w-]+)\)/g)].map((m) => m[1]!)];
      const css = model ? model.css([cls]) : "";
      refs = [...new Set([...own, ...varRefs(css)])].filter((r) => !r.startsWith("--tw-"));
      classCache.set(cls, refs);
    }
    return refs;
  };

  for (const abs of projectFiles(root, isTemplateSource)) {
    let src: string;
    try {
      src = sourceText(readFileSync(abs, "utf8")).text;
    } catch {
      continue;
    }
    if (!src.includes("html`")) continue;
    const file = relPath(root, abs);
    for (const lit of findHtmlLiterals(src)) {
      const raw = src.slice(lit.open, lit.close);
      for (const entry of elementsOf(parseTemplateTree(raw))) {
        const el = entry.el;
        for (const a of el.attrInfo) {
          const value = a.valueStart >= 0 ? raw.slice(a.valueStart, a.valueEnd) : "";
          const at = lineCol(src, lit.open + a.start);
          const base = { file, line: at.line, column: at.column, text: lineText(src, lit.open + a.start), tag: el.name, raw, offset: el.start };
          if (a.name === "style" || /^\[(style|attr\.style)(\.|\])/.test(a.name)) {
            for (const name of varRefs(value)) uses.push({ name, usage: { kind: "style", ...base } });
            continue;
          }
          const classes = a.name === "class" && !value.includes("{{") ? value.split(/\s+/).filter(Boolean) : /^\[class\.(.+)\]$/.test(a.name) ? [/^\[class\.(.+)\]$/.exec(a.name)![1]!] : [];
          for (const cls of classes) for (const name of classRefs(cls)) uses.push({ name, usage: { kind: "class", ...base, className: cls } });
        }
      }
    }
  }

  const direct = new Map<string, TokenUsage[]>();
  for (const u of uses) direct.set(u.name, [...(direct.get(u.name) ?? []), u.usage]);

  /** The token and every alias that reads it, transitively, with the alias each was reached through. */
  const closure = (name: string): Map<string, string | undefined> => {
    const out = new Map<string, string | undefined>([[name, undefined]]);
    const queue = [name];
    while (queue.length && out.size < 64) {
      const n = queue.shift()!;
      for (const a of aliasesOf.get(n) ?? []) {
        if (out.has(a)) continue;
        out.set(a, a);
        queue.push(a);
      }
    }
    return out;
  };
  /**
   * Classes made from an `@theme inline` token. Tailwind writes such a token's value into the classes, so `text-brand` reads
   * `var(--brand)` and never names `--color-brand`: its uses are the classes that read what it reads and are named after it
   * (the utility ends with its key: `-brand` for `--color-brand`, `-bold` or `-weight-bold` for `--font-weight-bold`).
   */
  const inlineUses = (name: string): TokenUsage[] => {
    const d = byNameDefs.get(name)?.find((x) => x.scope === "theme" && x.atRules.some((a) => /^@theme\b.*\binline\b/.test(a)));
    if (!d) return [];
    const parts = name.slice(2).split("-");
    const keys = parts.slice(1).map((_, i) => "-" + parts.slice(i + 1).join("-"));
    const out: TokenUsage[] = [];
    for (const ref of varRefs(d.value)) {
      for (const u of direct.get(ref) ?? []) {
        const utility = (u.className ?? "").split(":").pop()!.replace(/^!/, "").replace(/\/.*$/, "");
        if (u.kind === "class" && keys.some((k) => utility.endsWith(k))) out.push(u);
      }
    }
    return out;
  };
  const usagesOf = (name: string): TokenUsage[] => {
    const seen = new Set<string>();
    const out: TokenUsage[] = [];
    for (const [n, via] of closure(name)) {
      for (const u of [...(direct.get(n) ?? []), ...inlineUses(n)]) {
        const key = `${u.kind}|${u.file}|${u.line}|${u.column}|${u.className ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(via ? { ...u, via } : u);
      }
    }
    return out;
  };

  // --- tokens ------------------------------------------------------------------------------------------------------
  const value = (d: (typeof defs)[number] | null, lookup: (n: string) => string | null): TokenValue | null =>
    d ? { value: d.value, resolved: resolveVars(d.value, lookup), at: `${d.file}:${d.line}` } : null;

  const tokens: TokenInfo[] = [];
  for (const [name, list] of byNameDefs) {
    const l = lightDef(name);
    const dk = darkDef(name);
    const light = value(l, lookupLight);
    const dark = value(dk, lookupDark);
    const refs = varRefs(list[list.length - 1]!.value);
    let why: string | undefined;
    const lightTarget = l ? targetOf(l) : null;
    let darkTarget = dk ? targetOf(dk) : null;
    if (!l) why = `Only set inside ${list.map((d) => d.context).filter((c, i, all) => all.indexOf(c) === i).join(", ")}: edit those definitions.`;
    else if (!dk && lightTarget) {
      if (l.scope === "theme" && l.atRules.some((a) => /^@theme\b.*\binline\b/.test(a))) {
        why = `${name} is in @theme inline, so classes hold its value itself; a dark value has to be set on the token it reads${refs[0] ? ` (${refs[0]})` : ""}.`;
      } else {
        const pick = [...darkChains.values()].sort((a, b) => Number(b.d.target?.file === lightTarget.file) - Number(a.d.target?.file === lightTarget.file) || b.n - a.n)[0];
        if (pick) {
          const text = sheetOf.get(lightTarget.file)?.text ?? "";
          const spot = { name, selector: pick.d.selector, atRules: pick.d.atRules };
          darkTarget = { file: lightTarget.file, selector: spot.selector, atRules: spot.atRules, expect: findToken(text, spot).decl?.value ?? null, override: lightTarget.override };
        } else why = "This project sets no dark values (no .dark rule or prefers-color-scheme: dark block), so there is nowhere to add one.";
      }
    } else if (!lightTarget) why = "This definition is nested or has no project stylesheet importing it; edit it in code.";
    tokens.push({
      name,
      kind: kindOf(light?.resolved ?? resolveVars(list[list.length - 1]!.value, lookupLight)),
      light,
      dark,
      defs: list.map(({ group: _g, order: _o, chain: _c, sheet: _s, ...d }) => d),
      refs,
      aliases: [...(aliasesOf.get(name) ?? [])],
      uses: 0,
      edit: { light: lightTarget, dark: darkTarget, ...(why ? { why } : {}) },
    });
  }
  tokens.sort((a, b) => Number(!a.defs.some((d) => d.editable)) - Number(!b.defs.some((d) => d.editable)) || a.name.localeCompare(b.name));
  for (const t of tokens) t.uses = usagesOf(t.name).length;

  const sheetsOut: TokenSheet[] = sheets.map((s) => ({ file: s.file, editable: s.editable, ...(s.importer ? { importer: s.importer } : {}), tokens: defs.filter((d) => d.sheet === s).length }));
  const byName = new Map(tokens.map((t) => [t.name, t]));

  return {
    list: { ok: true, tokens, sheets: sheetsOut, darkVia, tailwind: !!model },
    byName,
    usages: usagesOf,
    elementTokens(classes: string, style: string): ElementToken[] {
      const out = new Map<string, ElementToken>();
      const add = (name: string, via: string) => {
        // `--color-brand: var(--brand)`: the token to edit is the one the alias reads.
        let n = name;
        const path: string[] = [];
        for (let i = 0; i < 4; i++) {
          const v = lightDef(n)?.value.trim() ?? "";
          const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v);
          if (!m || !byName.has(m[1]!)) break;
          path.push(n);
          n = m[1]!;
        }
        if (!byName.has(n) || out.has(n)) return;
        out.set(n, { name: n, via: path.length ? `${via} → ${path.join(" → ")}` : via });
      };
      const list = classes.split(/\s+/).filter(Boolean);
      for (const cls of list) for (const r of classRefs(cls)) add(r, `class ${cls}`);
      for (const r of varRefs(style)) add(r, "style");
      // The project's own rules for its classes (`.card { background: var(--brand) }`).
      for (const sheet of sheets) {
        if (!sheet.editable) continue;
        for (const d of sheet.scan.decls) {
          if (d.property.startsWith("--")) continue;
          const sel = sheet.scan.blocks[d.block]!.chain.filter((f) => f.kind === "rule").map((f) => f.text).join(" ");
          const cls = list.find((c) => new RegExp(`\\.${c.replace(/[^\w-]/g, (x) => "\\" + x)}(?![\\w-])`).test(sel));
          if (!cls) continue;
          for (const r of varRefs(d.value)) add(r, `.${cls} rule`);
        }
      }
      return [...out.values()];
    },
  };
}

/** A fingerprint of every file the index reads (stylesheets and template sources), so a cached index is reused only while none changed. */
export function tokenSignature(root: string): string {
  const parts: string[] = [];
  for (const abs of [...projectFiles(root, isCss), ...projectFiles(root, isTemplateSource)]) {
    try {
      const st = statSync(abs);
      parts.push(`${abs}:${st.mtimeMs}:${st.size}`);
    } catch {
      // vanished meanwhile
    }
  }
  return parts.join("|");
}
