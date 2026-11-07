import { existsSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The project's package manager: its lockfile first, then `npm_config_user_agent`, then npm. */
export function detectPackageManager(cwd: string, userAgent?: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return (/^(npm|pnpm|yarn|bun)\//.exec(userAgent ?? "")?.[1] as PackageManager | undefined) ?? "npm";
}

/** `gable-core-0.0.0.tgz` for `@gable/core`, found in `files`. */
function tarballFor(files: string[], name: string): string | undefined {
  const prefix = name.replace(/^@/, "").replace("/", "-") + "-";
  return files.find((f) => f.startsWith(prefix) && f.endsWith(".tgz") && /^\d/.test(f.slice(prefix.length)));
}

export interface DependencyRequest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface MergeResult {
  text: string;
  /** `name@range` of each dependency written. */
  added: string[];
}

/**
 * Adds the requested packages to a package.json text unless the project already lists them (in either dependency field).
 * With `localDir`, every added `@gable/*` package points at its tarball in that directory (as `create-gable --local` does)
 * and `overrides` pins every tarball there, since the packages depend on each other at the lockstep version.
 */
export function mergeDependencies(text: string, request: DependencyRequest, localDir?: string): MergeResult {
  const manifest = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
  const files = localDir ? tarballs(localDir) : [];
  const spec = (file: string) => `file:${join(localDir!, file).split(sep).join("/")}`;
  const existing = (name: string) => name in (manifest.dependencies ?? {}) || name in (manifest.devDependencies ?? {}) || name in (manifest.peerDependencies ?? {});
  const added: string[] = [];
  for (const field of ["dependencies", "devDependencies"] as const) {
    for (const [name, wanted] of Object.entries(request[field] ?? {})) {
      if (existing(name)) continue;
      let range = wanted;
      if (localDir && name.startsWith("@gable/")) {
        const file = tarballFor(files, name);
        if (!file) throw new Error(`--local: no tarball for ${name} in ${localDir}. Run "npm run pack:local <app-dir>" in the Gable repository first.`);
        range = spec(file);
      }
      manifest[field] = Object.fromEntries(Object.entries({ ...manifest[field], [name]: range }).sort(([a], [b]) => a.localeCompare(b)));
      added.push(`${name}@${range}`);
    }
  }
  if (localDir && added.some((a) => a.includes("@gable/"))) {
    const overrides = { ...manifest.overrides };
    for (const file of files) {
      const match = /^gable-(.+?)-\d[^/]*\.tgz$/.exec(file);
      if (match) overrides[`@gable/${match[1]}`] = spec(file);
    }
    manifest.overrides = Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)));
  }
  return { text: added.length ? JSON.stringify(manifest, null, indentOf(text)) + "\n" : text, added };
}

function tarballs(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`--local: ${dir} is not a directory.`);
  return readdirSync(dir);
}

function indentOf(text: string): string | number {
  return /^(\t+)"/m.test(text) ? "\t" : (/^( +)"/m.exec(text)?.[1]?.length ?? 2);
}
