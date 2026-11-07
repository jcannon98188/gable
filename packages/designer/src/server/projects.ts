// Which project the Designer works on: recent projects (kept in the user's data directory, like settings.ts), a folder
// lister for the Open project dialog, and the check of what a project needs before its preview can be inspected.
//
// The Preview agent has two halves. The Designer's half is injected by its Vite plugin and needs nothing from the project.
// The app's half is `installDesigner` from `@gable/core/designer`, which comes with the project's own `@gable/core`; it is
// "not installed" when that package cannot be found from the project (its dependencies were never installed) or is a
// version without the designer entry. Installing runs the project's own package manager, so the lockfile decides versions.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { findPackage, type ProjectLog } from "./dev-server.js";
import { dataDir } from "./settings.js";

// --- recent projects -------------------------------------------------------------------------------------------------

export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
  /** The folder or its package.json is gone. */
  missing?: boolean;
}

const RECENT_LIMIT = 10;
const recentFile = (dir: string) => join(dir, "recent.json");
const samePath = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

export function recentProjects(dir: string = dataDir()): RecentProject[] {
  let list: unknown;
  try {
    list = JSON.parse(readFileSync(recentFile(dir), "utf8"));
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is RecentProject => !!p && typeof p.root === "string" && isAbsolute(p.root))
    .slice(0, RECENT_LIMIT)
    .map((p) => ({ root: p.root, name: typeof p.name === "string" ? p.name : basename(p.root), openedAt: Number(p.openedAt) || 0, missing: !existsSync(join(p.root, "package.json")) }));
}

export function rememberProject(root: string, dir: string = dataDir(), now = Date.now()): RecentProject[] {
  const entry = { root, name: projectName(root), openedAt: now };
  const list = [entry, ...recentProjects(dir).filter((p) => !samePath(p.root, root)).map(({ missing: _, ...p }) => p)].slice(0, RECENT_LIMIT);
  mkdirSync(dir, { recursive: true });
  writeFileSync(recentFile(dir) + ".tmp", JSON.stringify(list, null, 2));
  renameSync(recentFile(dir) + ".tmp", recentFile(dir));
  return recentProjects(dir);
}

/** The package name, else the folder name. */
export function projectName(root: string): string {
  try {
    const name = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name?: unknown }).name;
    if (typeof name === "string" && name) return name;
  } catch {
    // no package.json
  }
  return basename(root) || root;
}

/** Why `root` cannot be opened as a project, or null when it can. */
export function projectProblem(root: string): string | null {
  if (!isAbsolute(root)) return "Give the project's full path.";
  if (!existsSync(root) || !statSync(root).isDirectory()) return `There is no folder at ${root}.`;
  if (!existsSync(join(root, "package.json"))) return `${root} has no package.json, so it is not a project folder.`;
  return null;
}

// --- folders -----------------------------------------------------------------------------------------------------------

export interface FolderListing {
  dir: string;
  parent: string | null;
  /** The folder itself is a project (has a package.json). */
  project: boolean;
  folders: Array<{ name: string; path: string; project: boolean }>;
  error?: string;
}

const HIDDEN = new Set(["node_modules", "$RECYCLE.BIN", "System Volume Information"]);

/** The sub-folders of `dir` (names only; files are never listed), marking the ones that are projects. */
export function listFolders(dir: string | undefined, fallback: string = homedir()): FolderListing {
  const at = resolve(dir && isAbsolute(dir) ? dir : fallback);
  const parent = dirname(at) === at ? null : dirname(at);
  const base = { dir: at, parent, project: existsSync(join(at, "package.json")) };
  try {
    const folders = readdirSync(at, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !HIDDEN.has(e.name))
      .map((e) => ({ name: e.name, path: join(at, e.name), project: existsSync(join(at, e.name, "package.json")) }))
      .sort((a, b) => Number(b.project) - Number(a.project) || a.name.localeCompare(b.name));
    return { ...base, folders };
  } catch (e) {
    return { ...base, folders: [], error: `Cannot read ${at}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// --- the project check -------------------------------------------------------------------------------------------------

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ProjectCheck {
  packageJson: boolean;
  packageManager: PackageManager;
  vite: { found: boolean; version: string | null; listed: boolean };
  agent: { found: boolean; version: string | null; listed: boolean; problem: string | null };
  /** The command that fixes what is missing, or null when nothing can be installed from here (see `problem`). */
  install: string[] | null;
  /** Why the project cannot be previewed, in a sentence, when nothing here can fix it. */
  problem: string | null;
}

const LOCKFILES: Array<[string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

/** The project's package manager: a `packageManager` field, else the nearest lockfile up the tree, else npm. */
export function detectPackageManager(root: string): PackageManager {
  for (let dir = root; ; dir = dirname(dir)) {
    try {
      const field = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { packageManager?: unknown }).packageManager;
      const name = typeof field === "string" ? field.split("@")[0] : "";
      if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") return name;
    } catch {
      // no package.json here
    }
    for (const [file, pm] of LOCKFILES) if (existsSync(join(dir, file))) return pm;
    if (dirname(dir) === dir) return "npm";
  }
}

export function checkProject(root: string): ProjectCheck {
  let manifest: Record<string, Record<string, string> | undefined> = {};
  let packageJson = false;
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as typeof manifest;
    packageJson = true;
  } catch {
    // reported below
  }
  const listed = (name: string) => [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies].some((d) => !!d && typeof d === "object" && name in d);
  const packageManager = detectPackageManager(root);
  const vitePkg = findPackage(root, "vite");
  const corePkg = findPackage(root, "@gable/core");
  const exportsDesigner = (() => {
    const exp = corePkg?.json.exports;
    return !!exp && typeof exp === "object" && "./designer" in exp;
  })();
  const vite = { found: !!vitePkg, version: str(vitePkg?.json.version), listed: listed("vite") };
  const agent = {
    found: !!corePkg && exportsDesigner,
    version: str(corePkg?.json.version),
    listed: listed("@gable/core"),
    problem: !corePkg
      ? "Preview agent not installed: @gable/core cannot be found from the project."
      : !exportsDesigner
        ? `Preview agent not installed: @gable/core ${str(corePkg.json.version) ?? ""} has no designer entry (@gable/core/designer). Update @gable/core.`
        : null,
  };
  let install: string[] | null = null;
  let problem: string | null = null;
  if (!packageJson) problem = "The folder has no package.json.";
  else if (!agent.listed && !corePkg) problem = "package.json does not list @gable/core, so this is not a Gable app.";
  else if (!vite.listed && !vitePkg) problem = "package.json does not list vite; the Designer runs the project's own Vite.";
  else if ((!vitePkg && vite.listed) || (!corePkg && agent.listed)) install = [packageManager, "install"];
  else if (!exportsDesigner) problem = agent.problem;
  return { packageJson, packageManager, vite, agent, install, problem };
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

// --- installing --------------------------------------------------------------------------------------------------------

/**
 * Runs the check's install command in the project, writing its output to the log. Resolves with the exit code. The command
 * is one of a fixed set (the package manager and `install`), never text from the client; on Windows the package managers are
 * `.cmd` shims, which only run through the shell.
 */
export function runInstall(root: string, command: string[], log: ProjectLog): Promise<number> {
  log.append(`\n$ ${command.join(" ")}\n`);
  return new Promise((done) => {
    const [cmd, ...args] = command;
    const child = spawn(cmd!, args, { cwd: root, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    child.stdout.on("data", (d: Buffer) => log.append(d.toString()));
    child.stderr.on("data", (d: Buffer) => log.append(d.toString()));
    child.on("error", (e) => {
      log.append(`[designer] could not run ${cmd}: ${e.message}\n`);
      done(-1);
    });
    child.on("close", (code) => {
      log.append(`[designer] ${command.join(" ")} exited with code ${code}\n`);
      done(code ?? -1);
    });
  });
}
