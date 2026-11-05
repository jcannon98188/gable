import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

interface Raw {
  extends?: string | string[];
  references?: Array<{ path: string }>;
  compilerOptions?: Record<string, unknown>;
}

/** Strips comments and trailing commas (tsconfig is JSONC). */
function parseJsonc(text: string): Raw {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const esVersion = (target: string) => {
  const t = target.toLowerCase();
  if (t === "esnext") return Infinity;
  const m = /^es(\d+)$/.exec(t);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 2015 ? n : n === 5 || n === 3 ? 5 : 0;
};

function resolveExtends(spec: string, from: string): string | null {
  const file = spec.endsWith(".json") ? spec : `${spec}.json`;
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const direct = resolve(dirname(from), spec.endsWith(".json") ? spec : `${spec}.json`);
    return existsSync(direct) ? direct : null;
  }
  try {
    return createRequire(from).resolve(file);
  } catch {
    try {
      return createRequire(from).resolve(`${spec}/tsconfig.json`);
    } catch {
      return null;
    }
  }
}

/** Effective compiler options of one tsconfig, with the file each option came from. */
function load(file: string, seen: Set<string>): Record<string, { value: unknown; file: string }> {
  if (seen.has(file)) return {};
  seen.add(file);
  const raw = parseJsonc(readFileSync(file, "utf8"));
  let options: Record<string, { value: unknown; file: string }> = {};
  const parents = raw.extends === undefined ? [] : Array.isArray(raw.extends) ? raw.extends : [raw.extends];
  for (const parent of parents) {
    const path = resolveExtends(parent, file);
    if (path) options = { ...options, ...load(path, seen) };
  }
  for (const [key, value] of Object.entries(raw.compilerOptions ?? {})) options[key] = { value, file };
  return options;
}

function problems(file: string, seen: Set<string>, out: string[]): void {
  if (seen.has(file)) return;
  const raw = parseJsonc(readFileSync(file, "utf8"));
  seen.add(file);
  const options = load(file, new Set());
  const bad = (key: string, why: string) => out.push(`${options[key]!.file}: "${key}" ${why}`);
  if (options.useDefineForClassFields?.value === false) bad("useDefineForClassFields", "is false; Gable needs native class fields. Set it to true (or remove it).");
  if (options.experimentalDecorators?.value === true) bad("experimentalDecorators", "is true; Gable components use no decorators. Remove it.");
  if (options.emitDecoratorMetadata?.value === true) bad("emitDecoratorMetadata", "is true; Gable emits no decorator metadata. Remove it.");
  const target = options.target?.value;
  if (typeof target === "string" && esVersion(target) < 2022 && options.useDefineForClassFields?.value !== true) {
    bad("target", `is ${target}, which makes TypeScript default useDefineForClassFields to false. Use ES2022 or newer (or set useDefineForClassFields: true).`);
  }
  for (const ref of raw.references ?? []) {
    const path = resolve(dirname(file), ref.path);
    const target = existsSync(path) && !path.endsWith(".json") ? resolve(path, "tsconfig.json") : path;
    if (existsSync(target)) problems(target, seen, out);
  }
}

/** Throws a clear error when the project's tsconfig conflicts with what Gable's field-initialiser setup needs. */
export function checkTsconfig(root: string, explicit?: string): void {
  const file = explicit ?? resolve(root, "tsconfig.json");
  if (!existsSync(file)) return;
  const out: string[] = [];
  problems(file, new Set(), out);
  if (out.length > 0) {
    throw new Error(`@gable/vite: tsconfig conflicts with Gable's native class fields:\n  ${[...new Set(out)].join("\n  ")}`);
  }
}
