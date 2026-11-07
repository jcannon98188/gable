import { builtinModules } from "node:module";
import { posix } from "node:path";

export interface ImportRef {
  specifier: string;
  /** Offset of the specifier text (inside its quotes). */
  start: number;
  end: number;
}

/** Replaces comments with spaces (newlines kept) so offsets stay valid and imports mentioned in docs are ignored. */
function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

/** Every module specifier of `import ... from`, `export ... from`, `import "x"` and `import("x")`. */
export function findImports(source: string): ImportRef[] {
  const masked = maskComments(source);
  const refs: ImportRef[] = [];
  const pattern = /\b(?:from|import)\s*\(?\s*(["'])([^"'\n]+)\1/g;
  for (let m = pattern.exec(masked); m; m = pattern.exec(masked)) {
    const end = m.index + m[0].length - 1;
    refs.push({ specifier: m[2]!, start: end - m[2]!.length, end });
  }
  return refs;
}

export const isRelative = (specifier: string): boolean => specifier.startsWith("./") || specifier.startsWith("../");

/** The npm package a bare specifier belongs to (`@gable/core/hmr` is `@gable/core`), or undefined for relative and builtin ones. */
export function packageOf(specifier: string): string | undefined {
  if (isRelative(specifier) || specifier.startsWith("/") || specifier.startsWith("node:")) return undefined;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
  return builtinModules.includes(name) ? undefined : name;
}

/** Rewrites the specifiers `replace` returns a new value for. */
export function rewriteImports(source: string, replace: (specifier: string) => string | undefined): string {
  let out = "";
  let last = 0;
  for (const ref of findImports(source)) {
    const next = replace(ref.specifier);
    if (next === undefined || next === ref.specifier) continue;
    out += source.slice(last, ref.start) + next;
    last = ref.end;
  }
  return out + source.slice(last);
}

/** The source file (relative to src, with its .ts extension) a relative specifier written in file `from` names. */
export function resolveSource(from: string, specifier: string): string {
  const path = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (path.endsWith(".js")) return path.slice(0, -3) + ".ts";
  return /\.[a-z]+$/i.test(path) ? path : path + ".ts";
}
