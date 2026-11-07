import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG, parseConfig, readConfig, writeConfig } from "./config.js";
import { cssFor, ensureImports, upsertBlock } from "./css.js";
import { resolveSource, rewriteImports } from "./imports.js";
import { mergeDependencies, type DependencyRequest } from "./manifest.js";
import type { Registry } from "./source.js";
import type { GableUiConfig, RegistryItem } from "./types.js";

/** Everything the commands need from outside, so tests can stub installs and capture output. */
export interface Context {
  cwd: string;
  log(line: string): void;
  warn(line: string): void;
  /** Installs the project's dependencies; undefined skips installing. Returns an exit code. */
  install?(): number | Promise<number>;
  localDir?: string;
}

const read = (file: string) => readFileSync(file, "utf8");

/** Where a registry file lands in the project, relative to the project root: `components/x.ts` goes to the components directory, `lib/x.ts` to the utils directory. */
export function destinationOf(sourcePath: string, config: GableUiConfig): string {
  const [root, ...rest] = sourcePath.split("/");
  if (rest.length === 0) throw new Error(`Unsupported registry file path "${sourcePath}".`);
  if (root === "components") return posix.join(config.componentsDir, ...rest);
  if (root === "lib") return posix.join(config.utilsDir, ...rest);
  throw new Error(`Unsupported registry file path "${sourcePath}" (expected components/ or lib/).`);
}

/**
 * Rewrites the relative imports of a registry file to point at where the imported files landed in the project.
 * `sources` maps the registry path of each file being installed to its project path. Specifiers that resolve to a
 * file outside that set are left as they are and reported through `unresolved`.
 */
export function rewriteFile(content: string, sourcePath: string, sources: Map<string, string>, unresolved: (specifier: string) => void = () => {}): string {
  const dest = sources.get(sourcePath)!;
  return rewriteImports(content, (specifier) => {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return undefined;
    const target = sources.get(resolveSource(sourcePath, specifier));
    if (!target) {
      unresolved(specifier);
      return undefined;
    }
    let relative = posix.relative(posix.dirname(dest), target);
    if (!relative.startsWith(".")) relative = "./" + relative;
    return specifier.endsWith(".js") ? relative.replace(/\.ts$/, ".js") : relative.replace(/\.ts$/, "");
  });
}

/** `names` and everything they need, dependencies first. */
export function resolveItems(registry: Registry, names: string[]): RegistryItem[] {
  const known = registry.index.items.map((i) => i.name);
  const ordered: RegistryItem[] = [];
  const seen = new Set<string>();
  const visit = (name: string, via?: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    if (!known.includes(name)) {
      const components = registry.index.items.filter((i) => i.type === "component").map((i) => i.name);
      throw new Error(via ? `"${via}" needs "${name}", which ${registry.origin} does not have.` : `No component named "${name}" in ${registry.origin}. Available: ${components.join(", ")}.`);
    }
    const item = registry.item(name);
    for (const dep of item.registryDependencies) visit(dep, name);
    ordered.push(item);
  };
  for (const name of names) visit(name);
  return ordered;
}

function installPackages(ctx: Context, request: DependencyRequest, noInstall: boolean): Promise<number> | number {
  const file = join(ctx.cwd, "package.json");
  const { text, added } = mergeDependencies(read(file), request, ctx.localDir);
  if (added.length === 0) return 0;
  writeFileSync(file, text);
  ctx.log(`  updated package.json: ${added.join(", ")}`);
  if (noInstall || !ctx.install) {
    ctx.log("  skipped installing (run your package manager's install to fetch them)");
    return 0;
  }
  return ctx.install();
}

function applyCss(ctx: Context, config: GableUiConfig, items: RegistryItem[], withImports: boolean): void {
  const file = join(ctx.cwd, config.css);
  const existed = existsSync(file);
  let css = existed ? read(file) : "";
  const before = css;
  if (withImports) css = ensureImports(css, [...new Set(items.flatMap((i) => i.cssImports ?? []))]);
  for (const item of items) {
    const body = cssFor(item);
    if (body) css = upsertBlock(css, item.name, body);
  }
  if (css === before && existed) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, css);
  ctx.log(`  ${existed ? "updated" : "created"} ${config.css}`);
}

function requireProject(ctx: Context): void {
  if (!existsSync(join(ctx.cwd, "package.json"))) throw new Error(`No package.json in ${ctx.cwd}: run gable-ui from your project root.`);
}

export interface InitOptions {
  componentsDir?: string;
  utilsDir?: string;
  css?: string;
  baseColor?: string;
  registry?: string;
  noInstall?: boolean;
}

/** Writes gable-ui.json, sets up the stylesheet (Tailwind and tw-animate-css imports, the theme) and adds the build-time dependencies. */
export async function init(ctx: Context, registry: Registry, options: InitOptions): Promise<number> {
  requireProject(ctx);
  const previous = readConfig(ctx.cwd);
  const config = parseConfig({
    ...DEFAULT_CONFIG,
    ...previous,
    ...Object.fromEntries(Object.entries({ componentsDir: options.componentsDir, utilsDir: options.utilsDir, css: options.css, baseColor: options.baseColor, registry: options.registry }).filter(([, v]) => v !== undefined)),
  });
  const item = registry.index.items.filter((i) => i.type === "style").map((i) => registry.item(i.name)).find((i) => i.baseColor === config.baseColor);
  if (!item) throw new Error(`${registry.origin} has no theme for base colour "${config.baseColor}". Available: ${registry.index.baseColors.join(", ") || "none"}.`);

  writeConfig(ctx.cwd, config);
  ctx.log(`  ${previous ? "updated" : "created"} ${CONFIG_FILE}`);
  applyCss(ctx, config, [item], true);
  const code = await installPackages(ctx, { dependencies: item.dependencies, devDependencies: item.devDependencies }, options.noInstall ?? false);
  if (code !== 0) throw new Error(`Installing dependencies failed (exit code ${code}).`);

  const viteConfig = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"].map((f) => join(ctx.cwd, f)).find(existsSync);
  if (viteConfig && !read(viteConfig).includes("@tailwindcss/vite")) {
    ctx.warn(`${posix.basename(viteConfig.replace(/\\/g, "/"))} does not use @tailwindcss/vite. Add \`import tailwindcss from "@tailwindcss/vite"\` and put \`tailwindcss()\` in plugins.`);
  }
  ctx.log(`\nReady. Import ${config.css} from your entry point, then: gable-ui add button`);
  return 0;
}

export interface AddOptions {
  overwrite?: boolean;
  noInstall?: boolean;
}

/** Copies the named components and what they need into the project, rewrites their imports, applies their CSS and installs their npm packages. */
export async function add(ctx: Context, registry: Registry, names: string[], options: AddOptions): Promise<number> {
  requireProject(ctx);
  const config = readConfig(ctx.cwd);
  if (!config) throw new Error(`No ${CONFIG_FILE} here. Run "gable-ui init" first.`);
  if (names.length === 0) throw new Error("Name at least one component to add (e.g. gable-ui add button).");
  const items = resolveItems(registry, names);
  const styles = items.filter((i) => i.type === "style");
  if (styles.length) throw new Error(`"${styles[0]!.name}" is a theme; "gable-ui init" installs it.`);

  const sources = new Map<string, string>();
  for (const item of items) for (const file of item.files) sources.set(file.path, destinationOf(file.path, config));

  let conflicts = 0;
  for (const item of items) {
    for (const file of item.files) {
      const dest = sources.get(file.path)!;
      const content = rewriteFile(file.content, file.path, sources, (specifier) => ctx.warn(`${file.path}: could not map import "${specifier}"; left unchanged.`));
      const target = resolve(ctx.cwd, dest);
      if (existsSync(target)) {
        if (read(target) === content) {
          ctx.log(`  unchanged ${dest}`);
          continue;
        }
        if (!options.overwrite) {
          conflicts++;
          ctx.warn(`${dest} already exists and differs; skipped (use --overwrite to replace it).`);
          continue;
        }
      }
      const verb = existsSync(target) ? "overwrote" : "created";
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      ctx.log(`  ${verb} ${dest}`);
    }
  }
  applyCss(ctx, config, items, false);
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  for (const item of items) Object.assign(dependencies, item.dependencies), Object.assign(devDependencies, item.devDependencies);
  const code = await installPackages(ctx, { dependencies, devDependencies }, options.noInstall ?? false);
  if (code !== 0) throw new Error(`Installing dependencies failed (exit code ${code}).`);
  return conflicts > 0 ? 1 : 0;
}
