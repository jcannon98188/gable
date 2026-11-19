// The runtime import boundary (ADR 0022): the default worker is built on core's public surface only.
//
// A runtime module may import other runtime modules, core's public entry (`@gable/service-worker/core`, or
// `core/index` by relative path), and packages other than @gable/service-worker. Anything else, such as a core
// internal, the app side or the test helpers, is a violation. Comments are not stripped, so an import written in a
// comment counts too.

/** A source file, by its path relative to the package's src directory (`runtime/worker.ts`). */
export interface SourceFile {
  readonly file: string;
  readonly source: string;
}

/** An import that crosses the boundary. */
export interface BoundaryViolation {
  readonly file: string;
  readonly specifier: string;
}

const PACKAGE = "@gable/service-worker";
const CORE_ENTRY = `${PACKAGE}/core`;

// `import x from "m"`, `import type { X } from "m"`, `import "m"`, `export { x } from "m"`, `export * from "m"`.
// The clause before `from` never contains a semicolon, which keeps a match inside one statement.
const STATIC = /\b(?:import|export)\s*(?:[^;"'`]*?\bfrom\s*)?["']([^"'\n]+)["']/g;
// `import("m")`
const DYNAMIC = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;

/** The module specifiers `source` imports or re-exports from, in source order. */
export function importSpecifiers(source: string): string[] {
  const found = new Map<number, string>();
  for (const pattern of [STATIC, DYNAMIC]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]!;
      found.set(match.index! + match[0].lastIndexOf(specifier), specifier);
    }
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, specifier]) => specifier);
}

/** `specifier` resolved from `file`'s directory, without extension; undefined when it leaves src. */
function resolveRelative(file: string, specifier: string): string | undefined {
  const parts = file.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else if (segment !== "." && segment !== "") parts.push(segment);
  }
  return parts.join("/").replace(/\.(?:[cm]?[jt]s)$/, "");
}

function allowed(file: string, specifier: string): boolean {
  if (specifier.startsWith(".")) {
    const target = resolveRelative(file, specifier);
    return target !== undefined && (target.startsWith("runtime/") || target === "core/index" || target === "core");
  }
  if (specifier === CORE_ENTRY) return true;
  return specifier !== PACKAGE && !specifier.startsWith(`${PACKAGE}/`);
}

/** Every import in `files` (runtime sources) that reaches past core's public entry. */
export function runtimeBoundaryViolations(files: readonly SourceFile[]): BoundaryViolation[] {
  return files.flatMap(({ file, source }) =>
    importSpecifiers(source)
      .filter((specifier) => !allowed(file, specifier))
      .map((specifier) => ({ file, specifier })),
  );
}
