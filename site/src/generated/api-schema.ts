// The JSON contract written by site/scripts/extract-api.mjs to site/src/generated/api/.
// Types only: nothing here exists at runtime.

/** api/index.json */
export interface ApiIndex {
  packages: Array<{
    name: string;
    slug: string;
    version: string;
    description: string;
    /** Import paths, e.g. "@gable/core" and "@gable/core/rxjs". */
    entryPoints: string[];
    symbolCount: number;
    /** Symbols with no TSDoc summary. */
    undocumentedCount: number;
  }>;
}

/** api/<slug>.json (slug is the package name without its scope, e.g. "core"). */
export interface ApiPackage {
  name: string;
  slug: string;
  version: string;
  description: string;
  entryPoints: ApiEntryPoint[];
}

export interface ApiEntryPoint {
  /** "@gable/core" or "@gable/core/rxjs". */
  path: string;
  /** Ordered by kind group (the ApiKind order below), then name. */
  symbols: ApiSymbol[];
}

export type ApiKind = "class" | "function" | "interface" | "type" | "const" | "enum" | "namespace" | "variable";

export interface ApiSymbol {
  /** Stable anchor: `${entryPoint}#${name}`. */
  id: string;
  name: string;
  kind: ApiKind;
  /**
   * Declaration text as a consumer sees it, TypeScript source. Functions: one signature per line (one
   * line per overload). Classes, interfaces, enums, namespaces: the header only (`class A<T> extends B`);
   * members are in `members`. Types and consts: one line when short, otherwise dedented multi-line.
   * Merged declarations (const + interface) are joined with newlines.
   */
  signature: string;
  /** First TSDoc paragraph, plain markdown on one line (`{@link X}` becomes `X` in code ticks). May be "". */
  summary: string;
  /** Remaining paragraphs plus any @remarks, markdown. May contain raw HTML-looking text; escape it. */
  remarks?: string;
  /** The @deprecated message ("Deprecated." when none was given). Present only when deprecated. */
  deprecated?: string;
  /** @example blocks, code only (fences stripped), language assumed ts. */
  examples: string[];
  /** Functions, and consts typed as a function type: parameters of the first overload. */
  params?: Array<{ name: string; type: string; description: string; optional: boolean }>;
  returns?: { type: string; description: string };
  typeParams?: Array<{ name: string; constraint?: string; description: string }>;
  /** Class, interface, enum, namespace members (also on a function merged with a namespace), declaration order. */
  members?: ApiMember[];
  extends?: string[];
  implements?: string[];
  /** @see and {@link} targets: symbol ids ("@gable/core#signal") when resolvable in the package, else raw text. */
  see?: string[];
  /** Repo-relative source file of the declaration (packages/<pkg>/src/...), when it can be found. */
  sourceFile?: string;
}

export interface ApiMember {
  name: string;
  /**
   * Namespace members use "method" for functions and "property" for everything else.
   * Index signatures are named "[index]", call signatures "()", construct signatures "new".
   */
  kind: "property" | "method" | "constructor" | "accessor" | "index" | "call" | "enum-member";
  /** Overloads and get/set pairs are joined, one per line. */
  signature: string;
  summary: string;
  optional: boolean;
  readonly: boolean;
  static: boolean;
  deprecated?: string;
  params?: ApiSymbol["params"];
  returns?: ApiSymbol["returns"];
}
