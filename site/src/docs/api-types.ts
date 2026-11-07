// The shape of the extractor's JSON (site/src/generated/api/*.json). Mirrors site/src/generated/api-schema.ts; kept local
// so the docs components type-check before the generated files exist.

export interface ApiParam {
  name: string;
  type: string;
  description: string;
  optional: boolean;
}

export interface ApiReturns {
  type: string;
  description: string;
}

export interface ApiMember {
  name: string;
  kind: string;
  signature: string;
  summary: string;
  optional: boolean;
  readonly: boolean;
  static: boolean;
  deprecated?: string | boolean;
  params?: ApiParam[];
  returns?: ApiReturns;
}

export interface ApiSymbol {
  id: string;
  name: string;
  kind: string;
  signature: string;
  summary: string;
  remarks?: string;
  deprecated?: string | boolean;
  examples: string[];
  params?: ApiParam[];
  returns?: ApiReturns;
  typeParams?: { name: string; constraint?: string; default?: string; description?: string }[] | string[];
  members?: ApiMember[];
  extends?: string[] | string;
  implements?: string[] | string;
  see?: string[];
  sourceFile?: string;
}

export interface ApiEntryPoint {
  path: string;
  symbols: ApiSymbol[];
}

export interface ApiPackage {
  name: string;
  slug: string;
  version: string;
  description: string;
  entryPoints: ApiEntryPoint[];
}

export interface ApiIndexEntry {
  name: string;
  slug: string;
  version: string;
  description: string;
  entryPoints: string[];
  symbolCount: number;
  undocumentedCount: number;
}

export interface ApiIndex {
  packages: ApiIndexEntry[];
}
