import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findImports, isRelative, packageOf, resolveSource } from "./imports.js";
import type { ItemType, RegistryIndex, RegistryItem } from "./types.js";

export interface BuildOptions {
  /** The packages/ui directory: `src/components`, `src/lib`, `theme.css`, `package.json`, optionally `src/registry-meta.ts`. */
  uiDir: string;
  /** The lockstep version stamped on the index and on `@gable/*` dependency ranges. */
  version: string;
}

export interface BuiltRegistry {
  index: RegistryIndex;
  items: RegistryItem[];
  warnings: string[];
}

/** Per-item facts `registry-meta.ts` may state; anything left out is inferred from the sources. */
export interface MetaEntry {
  name?: string;
  description?: string;
  /** Source files relative to `src`, for an item that is more than one file. */
  files?: string[];
  /** npm packages, as names (the range comes from the ui package.json) or `{ name: range }`. */
  dependencies?: string[] | Record<string, string>;
  registryDependencies?: string[];
  cssVars?: RegistryItem["cssVars"];
  css?: string;
}

/** Dependencies of the theme; the ranges the gallery and starter use. */
const THEME_DEPENDENCIES = { "@tailwindcss/vite": "^4.3.4", tailwindcss: "^4.3.4", "tw-animate-css": "^1.4.0" };
const BASE_COLOR = "neutral";
const DIRS: Array<{ dir: string; type: ItemType }> = [
  { dir: "components", type: "component" },
  { dir: "lib", type: "lib" },
];

/** The registry-meta module's entries by item name, or none when the file is absent. */
async function loadMeta(uiDir: string, warnings: string[]): Promise<Record<string, MetaEntry>> {
  const file = join(uiDir, "src", "registry-meta.ts");
  if (!existsSync(file)) return {};
  try {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<string, unknown>;
    // `packages/ui` describes itself with COMPONENT_META/LIB_META (checked by its own test); the build infers from imports.
    if (!mod.registryMeta && !mod.meta && !mod.default && mod.COMPONENT_META) return {};
    const value = (mod.registryMeta ?? mod.meta ?? mod.default) as Record<string, MetaEntry> | MetaEntry[] | undefined;
    if (!value || typeof value !== "object") throw new Error("it exports no registryMeta");
    if (!Array.isArray(value)) return value;
    return Object.fromEntries(value.map((entry) => [entry.name ?? "", entry]));
  } catch (error) {
    warnings.push(`registry-meta.ts could not be loaded (${(error as Error).message}); inferring from imports instead.`);
    return {};
  }
}

/** First plain line of the first doc comment, as the item description. */
function describe(source: string): string {
  const comment = /\/\*\*([\s\S]*?)\*\//.exec(source);
  if (!comment) return "";
  const lines = comment[1]!.split("\n").map((l) => l.replace(/^\s*\*? ?/, "").trim());
  return lines.find((l) => l && !l.startsWith("@") && !l.startsWith("<") && !l.startsWith("`")) ?? "";
}

const sortKeys = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

/**
 * Builds the registry from a gable-ui source tree: one item per file in `src/components` and `src/lib` (tests skipped),
 * plus the theme. Dependencies come from `registry-meta.ts` where it states them and from the imports otherwise.
 */
export async function buildRegistry({ uiDir, version }: BuildOptions): Promise<BuiltRegistry> {
  const warnings: string[] = [];
  const src = join(uiDir, "src");
  const uiManifest = JSON.parse(readFileSync(join(uiDir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const meta = await loadMeta(uiDir, warnings);

  const range = (pkg: string): string => {
    if (pkg.startsWith("@gable/")) return `~${version}`;
    const found = uiManifest.dependencies?.[pkg];
    if (!found) throw new Error(`The sources import "${pkg}", which is not in ${join(uiDir, "package.json")} dependencies.`);
    return found;
  };

  type Draft = { name: string; type: ItemType; files: string[] };
  const drafts: Draft[] = [];
  for (const { dir, type } of DIRS) {
    if (!existsSync(join(src, dir))) continue;
    for (const entry of readdirSync(join(src, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !/\.ts$/.test(entry.name) || /\.(test|dom\.test|d)\.ts$/.test(entry.name)) continue;
      const name = entry.name.replace(/\.ts$/, "");
      if (drafts.some((d) => d.name === name)) throw new Error(`Two registry items are named "${name}" (${dir}/${entry.name}); rename one.`);
      drafts.push({ name, type, files: meta[name]?.files ?? [`${dir}/${entry.name}`] });
    }
  }

  // Which item owns which source file, so an import can be traced to the item it needs.
  const owner = new Map<string, string>();
  for (const draft of drafts) for (const file of draft.files) owner.set(file, draft.name);

  const items: RegistryItem[] = drafts.map((draft) => {
    const entry = meta[draft.name];
    const files = draft.files.map((path) => {
      if (!existsSync(join(src, path))) throw new Error(`${draft.name}: file ${path} does not exist.`);
      return { path, content: readFileSync(join(src, path), "utf8") };
    });
    const inferredDeps = new Set<string>();
    const inferredRegistry = new Set<string>();
    for (const file of files) {
      if (!file.path.endsWith(".ts")) continue;
      for (const { specifier } of findImports(file.content)) {
        if (isRelative(specifier)) {
          const target = owner.get(resolveSource(file.path, specifier));
          if (!target) throw new Error(`${file.path} imports "${specifier}", which is not part of the registry. Move it into components/ or lib/, or list it in registry-meta.ts.`);
          if (target !== draft.name) inferredRegistry.add(target);
        } else {
          const pkg = packageOf(specifier);
          if (pkg) inferredDeps.add(pkg);
        }
      }
    }
    let dependencies: Record<string, string>;
    if (Array.isArray(entry?.dependencies)) dependencies = Object.fromEntries(entry.dependencies.map((pkg) => [pkg, range(pkg)]));
    else if (entry?.dependencies) dependencies = { ...entry.dependencies };
    else dependencies = Object.fromEntries([...inferredDeps].map((pkg) => [pkg, range(pkg)]));
    const registryDependencies = [...(entry?.registryDependencies ?? inferredRegistry)];
    if (entry) {
      for (const pkg of inferredDeps) if (!(pkg in dependencies)) warnings.push(`${draft.name}: imports "${pkg}" but registry-meta.ts does not list it.`);
      for (const dep of inferredRegistry) if (!registryDependencies.includes(dep)) warnings.push(`${draft.name}: imports item "${dep}" but registry-meta.ts does not list it.`);
    }
    for (const dep of registryDependencies) if (!drafts.some((d) => d.name === dep)) throw new Error(`${draft.name}: registryDependencies names "${dep}", which does not exist.`);
    const item: RegistryItem = {
      name: draft.name,
      type: draft.type,
      description: entry?.description ?? describe(files[0]?.content ?? ""),
      files,
      dependencies: sortKeys(dependencies),
      devDependencies: {},
      registryDependencies: registryDependencies.sort(),
    };
    if (entry?.cssVars) item.cssVars = entry.cssVars;
    if (entry?.css) item.css = entry.css;
    return item;
  });

  const themeFile = join(uiDir, "theme.css");
  if (existsSync(themeFile)) {
    // The file's header comment explains importing it as a package; that does not apply to copied CSS.
    const css = readFileSync(themeFile, "utf8").replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "").trimEnd() + "\n";
    items.push({
      name: `theme-${BASE_COLOR}`,
      type: "style",
      description: `The shadcn "${BASE_COLOR}" palette as CSS variables mapped onto Tailwind colour utilities.`,
      files: [],
      dependencies: {},
      devDependencies: sortKeys(THEME_DEPENDENCIES),
      registryDependencies: [],
      cssImports: ["tailwindcss", "tw-animate-css"],
      css,
      baseColor: BASE_COLOR,
    });
  } else warnings.push("theme.css not found: the registry has no theme.");

  const order: Record<ItemType, number> = { component: 0, lib: 1, style: 2 };
  items.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
  const index: RegistryIndex = {
    name: "gable-ui",
    formatVersion: 1,
    version,
    baseColors: [...new Set(items.flatMap((i) => (i.baseColor ? [i.baseColor] : [])))],
    items: items.map((i) => ({ name: i.name, type: i.type, description: i.description, path: `items/${i.name}.json` })),
  };
  return { index, items, warnings };
}

/** Writes `index.json` and `items/*.json` into `outDir`, replacing the ones already there. */
export function writeRegistry(built: BuiltRegistry, outDir: string): void {
  rmSync(join(outDir, "items"), { recursive: true, force: true });
  mkdirSync(join(outDir, "items"), { recursive: true });
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  writeFileSync(join(outDir, "index.json"), json(built.index));
  for (const item of built.items) writeFileSync(join(outDir, "items", `${item.name}.json`), json(item));
}
