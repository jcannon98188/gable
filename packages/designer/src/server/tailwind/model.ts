// Tailwind mode's brain: everything the panels need to know about classes, asked of the project's own design system (`Ds`).
// The Designer keeps no class table. A class's meaning is the CSS it compiles to; two classes conflict when they set the same
// CSS properties; a scale is the theme's own class list; breakpoints are the theme's `--breakpoint-*`.
import { CONTROLS, publicControls, type ControlSpec } from "./controls.js";
import type { AstNode, Ds } from "./design-system.js";
import type { AnalyzeResult, Breakpoint, ClassConflict, ControlOption, PlanResult, ResolvedValue, SearchHit, TailwindInfo, TokenInfo } from "./types.js";

/** The state variants the toolbar offers, when the design system has them (a project may rename or add to these). */
const TOOLBAR_STATES = ["hover", "focus", "focus-visible", "active", "disabled", "group-hover", "group-focus", "dark"];

/** Splits `md:hover:bg-red-500` at top-level colons (not inside `[...]` or `(...)`). */
export function splitToken(token: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) (parts.push(token.slice(start, i)), (start = i + 1));
  }
  return { variants: parts, utility: token.slice(start) };
}

export const classTokens = (value: string): string[] => value.split(/\s+/).filter(Boolean);

// --- CSS properties: which utilities set the same thing -------------------------------------------------------------

const SIDES = ["top", "right", "bottom", "left"];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const SHORTHANDS: Record<string, string[]> = {
  gap: ["row-gap", "column-gap"],
  overflow: ["overflow-x", "overflow-y"],
  flex: ["flex-grow", "flex-shrink", "flex-basis"],
  "border-radius": CORNERS.map((c) => `border-${c}-radius`),
  "border-width": SIDES.map((s) => `border-${s}-width`),
  "border-color": SIDES.map((s) => `border-${s}-color`),
  "border-style": SIDES.map((s) => `border-${s}-style`),
  "border-inline-width": ["border-left-width", "border-right-width"],
  "border-block-width": ["border-top-width", "border-bottom-width"],
  inset: SIDES,
  "inset-inline": ["left", "right"],
  "inset-block": ["top", "bottom"],
};
for (const box of ["padding", "margin", "scroll-padding", "scroll-margin"]) {
  SHORTHANDS[box] = SIDES.map((s) => `${box}-${s}`);
  SHORTHANDS[`${box}-inline`] = [`${box}-left`, `${box}-right`];
  SHORTHANDS[`${box}-block`] = [`${box}-top`, `${box}-bottom`];
}

/** The longhand properties a declared property covers (itself when it is one). */
export const expandProperty = (property: string): string[] => SHORTHANDS[property] ?? [property];

const expandAll = (properties: string[]): Set<string> => new Set(properties.flatMap(expandProperty));

/**
 * Whether `next` replaces `old`: they set at least one common property, unless `next` is strictly narrower (`px-2` next to
 * `p-4`: both stay, the narrower one wins in the cascade). A broader or overlapping `next` replaces.
 */
export function conflicts(next: string[], old: string[]): boolean {
  const a = expandAll(next);
  const b = expandAll(old);
  let common = 0;
  for (const p of a) if (b.has(p)) common++;
  if (common === 0) return false;
  return !(a.size < b.size && common === a.size);
}

// --- reading the compiled CSS ----------------------------------------------------------------------------------------

function declarations(nodes: AstNode[], out: Array<{ property: string; value: string }> = []): Array<{ property: string; value: string }> {
  for (const n of nodes) {
    if (n.kind === "declaration") out.push({ property: n.property, value: n.value ?? "" });
    else if (n.kind === "rule" || (n.kind === "at-rule" && n.name !== "@property" && n.name !== "@keyframes")) declarations(n.nodes, out);
  }
  return out;
}

/** What a utility claims: its properties, except values that only read a variable another utility sets (`var(--tw-...)`). */
export function claimsOf(ast: AstNode[]): string[] {
  const claimed = new Set<string>();
  for (const d of declarations(ast)) if (!d.value.trimStart().startsWith("var(--tw-") || d.property.startsWith("--tw-")) claimed.add(d.property);
  return [...claimed];
}

/** `calc(0.25rem * 4)` and `calc(1.25 / 0.875)` evaluated; anything else untouched. */
function evalCalc(value: string): string {
  const m = /^calc\(\s*(-?[\d.]+)([a-z%]*)\s*([*/])\s*(-?[\d.]+)([a-z%]*)\s*\)$/.exec(value.trim());
  if (!m) return value;
  const a = Number(m[1]);
  const b = Number(m[4]);
  const n = m[3] === "*" ? a * b : a / b;
  return `${Number(n.toFixed(4))}${m[2] || m[5]}`;
}

/** A declared value with the theme's variables filled in, for showing (not for writing). */
export function resolveValue(ds: Ds, value: string, depth = 0): string {
  if (depth > 6 || !value.includes("var(")) return evalCalc(value);
  const replaced = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (whole, name: string, fallback?: string) => {
    if (name.startsWith("--tw-")) return fallback !== undefined ? fallback : whole;
    return ds.resolveThemeValue(name) ?? fallback ?? whole;
  });
  return replaced === value ? evalCalc(value) : resolveValue(ds, replaced, depth + 1);
}

export function printAst(nodes: AstNode[], indent = ""): string {
  let out = "";
  for (const n of nodes) {
    if (n.kind === "declaration") out += `${indent}${n.property}: ${n.value}${n.important ? " !important" : ""};\n`;
    else if (n.kind === "rule") out += `${indent}${n.selector} {\n${printAst(n.nodes, indent + "  ")}${indent}}\n`;
    else if (n.kind === "at-rule") out += n.nodes.length ? `${indent}${n.name} ${n.params} {\n${printAst(n.nodes, indent + "  ")}${indent}}\n` : `${indent}${n.name} ${n.params};\n`;
  }
  return out;
}

// --- forced states: the injected rule -------------------------------------------------------------------------------

/** The pseudo-class a state variant stands for, when forcing it means dropping that pseudo-class from a selector. */
const PSEUDO_OF: Record<string, string> = { hover: "hover", "group-hover": "hover", "peer-hover": "hover", focus: "focus", "group-focus": "focus", "focus-visible": "focus-visible", "focus-within": "focus-within", active: "active", disabled: "disabled", "group-active": "active", enabled: "enabled", checked: "checked" };
const FORCE_ATTR = "data-gd-forced";
const UNWRAP_MEDIA = /^\(\s*(hover:\s*hover|prefers-color-scheme:\s*dark)\s*\)$/;

/**
 * Rewrites a utility's compiled rules so they apply to the element marked `data-gd-forced` as if `states` were active:
 * the pseudo-classes are dropped from the selector, the `(hover: hover)` and `(prefers-color-scheme: dark)` conditions
 * unwrapped, and the element is matched by the mark. Used where CDP cannot force a pseudo-state (and for `disabled` and
 * `dark`, which are not pseudo-states CDP can force).
 */
export function forceRules(nodes: AstNode[], states: string[]): AstNode[] {
  const pseudos = new Set(states.map((s) => PSEUDO_OF[s]).filter((p): p is string => !!p));
  const rewrite = (selector: string): string => {
    let s = selector;
    // Only real pseudo-classes: the class name itself is escaped (`.xl\:hover\:p-4`), so a colon after a backslash is not one.
    for (const p of pseudos) s = s.replace(new RegExp(String.raw`(?<!\\):${p}(?![\w-])`, "g"), "");
    if (states.includes("dark")) s = s.replace(/:(?:is|where)\([^()]*\.dark[^()]*\)/g, "");
    return s.includes("::") ? s : `${s}[${FORCE_ATTR}]`;
  };
  const walk = (list: AstNode[]): AstNode[] =>
    list.flatMap((n): AstNode[] => {
      if (n.kind === "rule") return [{ ...n, selector: rewrite(n.selector), nodes: n.nodes.map((d) => (d.kind === "declaration" ? { ...d, important: true } : d)) }];
      if (n.kind === "at-rule") {
        if (n.name === "@property") return [];
        const inner = walk(n.nodes);
        return n.name === "@media" && UNWRAP_MEDIA.test(n.params.trim()) ? inner : [{ ...n, nodes: inner }];
      }
      return [];
    });
  return walk(nodes);
}

// --- the model ----------------------------------------------------------------------------------------------------

export interface TailwindModelInfo {
  version: string;
  source: "project" | "designer";
  entry: string;
  sortsClasses: boolean;
}

export class TailwindModel {
  readonly ds: Ds;
  readonly breakpoints: Breakpoint[];
  readonly sorts: boolean;
  readonly #meta: TailwindModelInfo;
  #asts = new Map<string, AstNode[]>();
  #tokens = new Map<string, TokenInfo>();
  #options = new Map<string, ControlOption[]>();
  #names: string[] | null = null;
  #classSet: Set<string> | null = null;

  constructor(ds: Ds, meta: TailwindModelInfo) {
    this.ds = ds;
    this.#meta = meta;
    this.sorts = meta.sortsClasses;
    this.breakpoints = readBreakpoints(ds);
  }

  info(): TailwindInfo {
    const variants = new Set(this.ds.getVariants().map((v) => v.name));
    return {
      enabled: true,
      version: this.#meta.version,
      source: this.#meta.source,
      entry: this.#meta.entry,
      breakpoints: this.breakpoints,
      // `group-hover` is not a variant of its own: it is the compound `group-` applied to `hover`.
      states: TOOLBAR_STATES.filter((s) => variants.has(s) || (s.startsWith("group-") && variants.has("group") && variants.has(s.slice(6)))),
      sortsClasses: this.sorts,
      controls: publicControls(),
    };
  }

  /** The compiled rules of one class, with every variant it carries. Empty for a name the design system does not know. */
  ast(token: string): AstNode[] {
    let ast = this.#asts.get(token);
    if (!ast) {
      try {
        ast = this.ds.candidatesToAst([token])[0] ?? [];
      } catch {
        ast = [];
      }
      this.#asts.set(token, ast);
    }
    return ast;
  }

  token(token: string): TokenInfo {
    let info = this.#tokens.get(token);
    if (!info) {
      const { variants, utility } = splitToken(token);
      const ast = this.ast(token);
      const bp = variants.find((v) => this.breakpoints.some((b) => b.name === v)) ?? null;
      info = { token, variants, breakpoint: bp, states: variants.filter((v) => v !== bp), utility, known: ast.length > 0, claims: ast.length ? claimsOf(ast) : [] };
      this.#tokens.set(token, info);
    }
    return info;
  }

  #rank(bp: string | null): number {
    return bp === null || bp === "base" ? 0 : this.breakpoints.findIndex((b) => b.name === bp) + 1;
  }

  #valueOf(utility: string, property: string, kind: ControlSpec["kind"], root?: string): { label: string; detail: string; swatch?: string } {
    const decl = declarations(this.ast(utility)).find((d) => d.property === property);
    const detail = decl ? resolveValue(this.ds, decl.value) : "";
    const bare = utility.replace(/^!/, "").replace(/^-/, "");
    const label = root && bare.startsWith(root + "-") ? bare.slice(root.length + 1) : root && bare === root ? "default" : bare;
    return { label: kind === "choice" ? bare : label, detail, swatch: kind === "color" && detail && !detail.includes("var(") ? detail : undefined };
  }

  /** The control's value at an editing context: the breakpoint and the states being edited (mobile-first). */
  analyze(classes: string, breakpoint: string | null, states: string[]): AnalyzeResult {
    const tokens = classTokens(classes).map((t) => this.token(t));
    const ctxKey = [...states].sort().join(",");
    const ctxRank = this.#rank(breakpoint);
    const values: Record<string, ResolvedValue | null> = {};
    for (const control of CONTROLS) {
      const hits = tokens.filter((t) => t.known && t.claims.includes(control.property));
      const pick = (key: string) => {
        let best: TokenInfo | null = null;
        for (const t of hits) {
          if (t.states.slice().sort().join(",") !== key || this.#rank(t.breakpoint) > ctxRank) continue;
          if (!best || this.#rank(t.breakpoint) >= this.#rank(best.breakpoint)) best = t;
        }
        return best;
      };
      let found = pick(ctxKey);
      let fromBaseState = false;
      if (!found && ctxKey) (found = pick(""), (fromBaseState = !!found));
      if (!found) {
        values[control.id] = null;
        continue;
      }
      const root = (control.roots ?? []).find((r) => found!.utility.replace(/^!/, "").replace(/^-/, "").startsWith(r + "-") || found!.utility.replace(/^!/, "") === r);
      const v = this.#valueOf(found.utility, control.property, control.kind, root);
      values[control.id] = { utility: found.utility, token: found.token, ...v, at: found.breakpoint ?? "base", inherited: this.#rank(found.breakpoint) < ctxRank, fromBaseState };
    }
    return { tokens, values, conflicts: this.conflictsIn(tokens) };
  }

  /**
   * The pairs of classes that set the same properties at the same variants, both ways (`gap-3 gap-4`; not `p-4 px-2`, where
   * the narrower one is meant to win). The winner is the one the stylesheet puts later, which is Tailwind's class order.
   */
  conflictsIn(tokens: TokenInfo[]): ClassConflict[] {
    const key = (t: TokenInfo) => [...t.variants].sort().join(",");
    const known = tokens.filter((t) => t.known && t.claims.length);
    if (known.length < 2) return [];
    const order = new Map(this.ds.getClassOrder(known.map((t) => t.token)).map(([name, o]) => [name, o]));
    const out: ClassConflict[] = [];
    const lost = new Set<string>();
    for (let i = 0; i < known.length; i++) {
      for (let j = i + 1; j < known.length; j++) {
        const a = known[i]!;
        const b = known[j]!;
        if (a.token === b.token || key(a) !== key(b) || !conflicts(a.claims, b.claims) || !conflicts(b.claims, a.claims)) continue;
        const oa = order.get(a.token);
        const ob = order.get(b.token);
        // the later rule wins; with no order to go by, the later class in the attribute is the guess
        const bWins = oa == null || ob == null ? true : ob >= oa;
        const [winner, loser] = bWins ? [b, a] : [a, b];
        if (lost.has(loser.token + ">" + winner.token)) continue;
        lost.add(loser.token + ">" + winner.token);
        const theirs = new Set(winner.claims.flatMap(expandProperty));
        out.push({ winner: winner.token, loser: loser.token, properties: [...new Set(loser.claims.flatMap(expandProperty))].filter((p) => theirs.has(p)) });
      }
    }
    return out;
  }

  /** The utilities a control offers, from the design system's own class list; those the system says claim its property. */
  options(controlId: string): ControlOption[] {
    const cached = this.#options.get(controlId);
    if (cached) return cached;
    const spec = CONTROLS.find((c) => c.id === controlId);
    if (!spec) return [];
    const names = this.#classNames();
    const candidates = new Set<string>();
    for (const n of spec.names ?? []) if (this.#classSet!.has(n)) candidates.add(n);
    for (const r of spec.roots ?? []) for (const n of names) if (n === r || n.startsWith(r + "-")) candidates.add(n);
    const list = [...candidates].filter((n) => !n.startsWith("-") && !n.includes("["));
    let asts: AstNode[][] = [];
    try {
      asts = this.ds.candidatesToAst(list);
    } catch {
      asts = [];
    }
    const out: ControlOption[] = [];
    list.forEach((utility, i) => {
      const ast = asts[i] ?? [];
      if (!claimsOf(ast).includes(spec.property)) return;
      this.#asts.set(utility, ast);
      const root = (spec.roots ?? []).find((r) => utility === r || utility.startsWith(r + "-"));
      const v = this.#valueOf(utility, spec.property, spec.kind, root);
      out.push({ utility, label: v.label, detail: v.detail, ...(v.swatch ? { swatch: v.swatch } : {}) });
    });
    this.#options.set(controlId, out);
    return out;
  }

  #classNames(): string[] {
    if (!this.#names) {
      this.#names = this.ds.getClassList().map(([name]) => name);
      this.#classSet = new Set(this.#names);
    }
    return this.#names;
  }

  /** The class order the repo's formatter (prettier-plugin-tailwindcss) would give: Tailwind's own, unknown classes first. */
  sort(tokens: string[]): string[] {
    const order = new Map(this.ds.getClassOrder(tokens).map(([name, o]) => [name, o]));
    const known = tokens.filter((t) => order.get(t) != null);
    const unknown = tokens.filter((t) => order.get(t) == null);
    known.sort((a, b) => (order.get(a)! < order.get(b)! ? -1 : order.get(a)! > order.get(b)! ? 1 : 0));
    return [...unknown, ...known];
  }

  /** The token for `utility` at an editing context: `dark:md:hover:p-4`. */
  tokenFor(utility: string, breakpoint: string | null, states: string[]): string {
    const dark = states.filter((s) => s === "dark");
    const rest = states.filter((s) => s !== "dark");
    return [...dark, ...(breakpoint && breakpoint !== "base" ? [breakpoint] : []), ...rest, utility].join(":");
  }

  /**
   * The class list after setting `utility` at a context (or writing `token` as typed): conflicting classes at the same
   * variants are replaced (judged by the properties the design system says they set), the rest are untouched, and the new
   * class goes where the repo's formatter would put it (appended when it does not sort classes).
   */
  plan(input: { classes: string; utility?: string; token?: string; breakpoint: string | null; states: string[]; remove?: string[] }): PlanResult {
    const existing = classTokens(input.classes);
    if (input.remove && !input.utility && !input.token) {
      const drop = new Set(input.remove);
      const left = existing.filter((t) => !drop.has(t));
      return { ok: true, classes: left.join(" "), token: "", added: false, removed: existing.filter((t) => drop.has(t)) };
    }
    const typed = input.token ?? (input.utility ? this.tokenFor(input.utility, input.breakpoint, input.states) : "");
    if (!typed) return { ok: false, error: "No class given." };
    if (/\s/.test(typed)) return { ok: false, error: "A class cannot contain spaces." };
    const next = this.token(typed);
    if (!next.known) return { ok: false, error: `"${typed}" is not a class of this project's Tailwind design system.` };
    if (existing.includes(typed)) return { ok: true, classes: existing.join(" "), token: typed, added: false, removed: [] };
    const key = (t: TokenInfo) => [...t.variants].sort().join(",");
    const removed: string[] = [];
    const kept = existing.filter((t) => {
      const info = this.token(t);
      if (!info.known || key(info) !== key(next) || !conflicts(next.claims, info.claims)) return true;
      removed.push(t);
      return false;
    });
    const all = [...kept, typed];
    return { ok: true, classes: (this.sorts ? this.sort(all) : all).join(" "), token: typed, added: true, removed };
  }

  /** Classes matching what was typed: all words must appear; names that start with the query first. `prefix` is carried over. */
  search(query: string, prefix: string, limit = 40): SearchHit[] {
    const names = this.#classNames();
    const q = query.trim().toLowerCase();
    const hits: SearchHit[] = [];
    const arbitrary = /^[a-z][\w-]*-\[.+\]$/.test(q) || /^-?[a-z][\w-]*\[.+\]$/.test(q);
    const push = (utility: string) => {
      const token = prefix + utility;
      hits.push({ token, utility, css: this.summary(token) });
    };
    if (arbitrary && this.token(prefix + query.trim()).known) push(query.trim());
    if (q) {
      const words = q.split(/\s+/);
      const ranked: Array<{ n: string; r: number }> = [];
      for (const n of names) {
        if (n.startsWith("-") && !q.startsWith("-")) continue;
        const lower = n.toLowerCase();
        if (!words.every((w) => lower.includes(w))) continue;
        ranked.push({ n, r: lower.startsWith(words[0]!) ? 0 : lower.includes("-" + words[0]!) ? 1 : 2 });
      }
      ranked.sort((a, b) => a.r - b.r || a.n.length - b.n.length || a.n.localeCompare(b.n));
      for (const { n } of ranked.slice(0, limit)) push(n);
    }
    return hits;
  }

  /** `padding: 1rem; font-size: 0.875rem` for a class, theme values filled in. */
  summary(token: string): string {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const d of declarations(this.ast(token))) {
      if (d.property.startsWith("--tw-") && d.property !== "--tw-shadow") continue;
      const text = `${d.property}: ${resolveValue(this.ds, d.value)}`;
      if (!seen.has(text)) (seen.add(text), parts.push(text));
    }
    return parts.join("; ");
  }

  /** The CSS of classes as the build would emit it (with the `@property` defaults), for a temporary preview. */
  css(tokens: string[]): string {
    try {
      return this.ds
        .candidatesToCss(tokens)
        .filter((c): c is string => !!c)
        .join("\n");
    } catch {
      return "";
    }
  }

  /**
   * The injected rule for forcing `states` on the selected element: the element's own classes that carry those states,
   * rewritten (see `forceRules`). Empty when it has none.
   */
  forceCss(classes: string, states: string[], all: string[] = states): string {
    const want = new Set(all);
    let css = "";
    for (const t of classTokens(classes).map((c) => this.token(c))) {
      if (!t.known || !t.states.some((s) => states.includes(s)) || !t.states.every((s) => want.has(s))) continue;
      css += printAst(forceRules(this.ast(t.token), states));
    }
    return css;
  }
}

/** `--breakpoint-*` of the theme, in px, ascending. Values the Designer cannot turn into pixels (calc, other units) are left out. */
export function readBreakpoints(ds: Ds): Breakpoint[] {
  const out: Breakpoint[] = [];
  for (const [name, raw] of ds.theme.namespace("--breakpoint")) {
    if (!name) continue;
    const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(raw.trim());
    if (m) out.push({ name, raw, min: Math.round(Number(m[1]) * (m[2] === "px" || !m[2] ? 1 : 16)) });
  }
  return out.sort((a, b) => a.min - b.min);
}
