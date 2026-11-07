// Loading the project's real Tailwind v4 design system. Tailwind exposes it only through `__unstable__loadDesignSystem`
// (@tailwindcss/node), whose API its authors reserve the right to change. This file is the one place that touches it:
//
//  - the loader is taken from the PROJECT's own node_modules first, so the design system is the one the app is built with
//    (custom `@theme`, `@plugin`, `@custom-variant`, `@source` all behave as in the build);
//  - if the project cannot offer one (a pnpm layout that hides it, for instance) the Designer's own pinned copy is used
//    (`@tailwindcss/node` in this package's dependencies, VERIFIED_TAILWIND), which still reads the project's stylesheet;
//  - the shape of what comes back is checked against `Ds` below; any missing member, or a load error, turns the mode off with
//    a message instead of throwing into the Content tab. Nothing else in the Designer imports Tailwind.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** The Tailwind version the API below was verified against (the Designer's own copy is pinned to it). */
export const VERIFIED_TAILWIND = "4.3.5";

export type AstNode =
  | { kind: "rule"; selector: string; nodes: AstNode[] }
  | { kind: "at-rule"; name: string; params: string; nodes: AstNode[] }
  | { kind: "declaration"; property: string; value: string | undefined; important: boolean }
  | { kind: "comment" | "context" | "at-root"; nodes?: AstNode[] };

/** The part of Tailwind's `DesignSystem` that Tailwind mode uses. */
export interface Ds {
  theme: {
    namespace(ns: string): Map<string | null, string>;
    prefix?: string | null;
  };
  getClassList(): Array<[string, { modifiers: string[] }]>;
  getVariants(): Array<{ name: string; isArbitrary: boolean; values: string[] }>;
  getClassOrder(classes: string[]): Array<[string, bigint | null]>;
  candidatesToAst(classes: string[]): AstNode[][];
  candidatesToCss(classes: string[]): Array<string | null>;
  parseCandidate(candidate: string): Array<{ kind: string; root: string }>;
  resolveThemeValue(path: string, forceInline?: boolean): string | undefined;
}

export interface Loaded {
  ds: Ds;
  version: string;
  source: "project" | "designer";
  /** Project-relative, with forward slashes. */
  entry: string;
}

export type LoadResult = ({ ok: true } & Loaded) | { ok: false; message: string };

const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "target", "coverage", "vendor"]);
const V4_IMPORT = /@import\s+(?:url\()?\s*["']tailwindcss(?:\/[^"']*)?["']/;
const V3_DIRECTIVE = /@tailwind\s+(?:base|components|utilities)\b/;

/** Stylesheets of the project (not dependencies), shallowest first so `src/styles.css` wins over a nested demo. */
function cssFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) walk(join(dir, e.name), depth + 1);
      } else if (e.name.endsWith(".css")) found.push(join(dir, e.name));
    }
  };
  walk(root, 0);
  return found.sort((a, b) => a.split(sep).length - b.split(sep).length || a.localeCompare(b));
}

/** The stylesheet that starts Tailwind (`@import "tailwindcss"`), the one whose `@theme` is the project's design tokens. */
export function findEntry(root: string): { file: string } | { v3: boolean } {
  let v3 = false;
  for (const file of cssFiles(root)) {
    const text = readFileSync(file, "utf8");
    if (V4_IMPORT.test(text)) return { file };
    if (V3_DIRECTIVE.test(text)) v3 = true;
  }
  return { v3 };
}

const REQUIRED: Array<keyof Ds> = ["theme", "getClassList", "getVariants", "getClassOrder", "candidatesToAst", "candidatesToCss", "parseCandidate", "resolveThemeValue"];

/** Null when `value` has the members of `Ds`; otherwise says which is missing. */
export function shapeProblem(value: unknown): string | null {
  const ds = value as Record<string, unknown> | null;
  if (!ds || typeof ds !== "object") return "no design system was returned";
  for (const key of REQUIRED) if (!(key in ds)) return `it has no \`${key}\``;
  if (typeof (ds.theme as { namespace?: unknown }).namespace !== "function") return "its theme has no `namespace()`";
  return null;
}

/** The directory of the package `name` that contains the resolved file (package.json is not always exported, so walk up). */
function packageDir(file: string, name: string): string | null {
  for (let dir = dirname(file); dirname(dir) !== dir; dir = dirname(dir)) {
    try {
      if ((JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string }).name === name) return dir;
    } catch {
      // not a package root
    }
  }
  return null;
}

interface NodeModule {
  __unstable__loadDesignSystem?: (css: string, opts: { base: string }) => Promise<unknown>;
}

/** Finds `@tailwindcss/node` as the project would: from the project, then through `@tailwindcss/vite`, then the Designer's own. */
async function locateLoader(root: string): Promise<{ mod: NodeModule; dir: string; source: "project" | "designer" } | null> {
  const attempts: Array<{ from: string; source: "project" | "designer"; via?: string }> = [
    { from: join(root, "package.json"), source: "project" },
    { from: join(root, "package.json"), source: "project", via: "@tailwindcss/vite" },
    { from: import.meta.url, source: "designer" },
  ];
  for (const a of attempts) {
    try {
      let req = createRequire(a.from.startsWith("file:") ? a.from : pathToFileURL(a.from));
      if (a.via) req = createRequire(pathToFileURL(req.resolve(`${a.via}/package.json`)));
      const dir = packageDir(req.resolve("@tailwindcss/node"), "@tailwindcss/node");
      if (!dir) continue;
      const mod = (await import(pathToFileURL(join(dir, "dist", "index.mjs")).href)) as NodeModule;
      if (typeof mod.__unstable__loadDesignSystem === "function") return { mod, dir, source: a.source };
    } catch {
      // try the next place
    }
  }
  return null;
}

export async function loadDesignSystem(root: string): Promise<LoadResult> {
  const entry = findEntry(root);
  if (!("file" in entry))
    return {
      ok: false,
      message: entry.v3
        ? 'This project uses Tailwind v3 (@tailwind directives). Tailwind mode needs Tailwind v4 (a stylesheet that starts with @import "tailwindcss").'
        : 'This project does not use Tailwind v4: no stylesheet imports "tailwindcss". Tailwind mode is off; the Content tab works as usual.',
    };
  const rel = relative(root, entry.file).split(sep).join("/");
  const loader = await locateLoader(root);
  if (!loader) return { ok: false, message: "Tailwind's design-system loader (@tailwindcss/node) could not be found in the project or the Designer." };
  try {
    const ds = await loader.mod.__unstable__loadDesignSystem!(readFileSync(entry.file, "utf8"), { base: dirname(entry.file) });
    const problem = shapeProblem(ds);
    if (problem) return { ok: false, message: `Tailwind's unstable design-system API changed (${problem}); the Designer was verified against Tailwind ${VERIFIED_TAILWIND}. Tailwind mode is off.` };
    let version = "4";
    try {
      const dir = packageDir(createRequire(join(loader.dir, "package.json")).resolve("tailwindcss"), "tailwindcss");
      if (dir) version = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version;
    } catch {
      // the version label is informational
    }
    if (!version.startsWith("4")) return { ok: false, message: `Tailwind ${version} is not supported; Tailwind mode needs Tailwind v4.` };
    return { ok: true, ds: ds as Ds, version, source: loader.source, entry: rel };
  } catch (e) {
    return { ok: false, message: `Tailwind's design system failed to load from ${rel}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}. Tailwind mode is off.` };
  }
}
