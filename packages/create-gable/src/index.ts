import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The package managers whose commands the generated README can show. */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** The package manager that invoked us, from `npm_config_user_agent` (npm when absent or unknown). */
export function detectPackageManager(userAgent: string | undefined): PackageManager {
  const name = /^(npm|pnpm|yarn|bun)\//.exec(userAgent ?? "")?.[1];
  return (name as PackageManager | undefined) ?? "npm";
}

/** How to install and how to run a package.json script with each package manager. */
export function commandsFor(pm: PackageManager): { install: string; run: string } {
  return { install: `${pm} install`, run: pm === "npm" ? "npm run" : pm };
}

const here = fileURLToPath(new URL(".", import.meta.url));
const templateDir = join(here, "..", "template");
/** The service worker option's files: added to the starter, or put in place of the starter's own. */
const serviceWorkerDir = join(here, "..", "template-service-worker");
const ownVersion = (): string => JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).version;

/** Dotfiles that npm would drop or rename when packing are stored under another name. */
const RENAMED: Record<string, string> = { _gitignore: ".gitignore" };

/** Options for {@link scaffold}. */
export interface ScaffoldOptions {
  /** Project (and package) name. */
  name: string;
  /** Directory to create; must not exist or must be empty. */
  targetDir: string;
  /** Package manager whose commands the README shows. Default npm. */
  packageManager?: PackageManager;
  /**
   * Adds a service worker (`@gable/service-worker`): the dependency, the `gableServiceWorker()` Vite plugin, a
   * `gable.sw.json`, the registration in `src/main.ts` and an update banner. Default false, and the starter then has
   * none of it.
   */
  serviceWorker?: boolean;
  /** A directory of `@gable/*` tarballs (see `npm run pack:local`): the starter then installs from them instead of the registry. */
  localDir?: string;
}

/** True when `dir` holds a tarball for `name` (`@gable/core` is `gable-core-<version>.tgz`). */
function tarballFor(files: string[], name: string): string | undefined {
  const prefix = name.replace(/^@/, "").replace("/", "-") + "-";
  return files.find((f) => f.startsWith(prefix) && f.endsWith(".tgz") && /^\d/.test(f.slice(prefix.length)));
}

/** Points every `@gable/*` dependency in the manifest text at a tarball in `dir` and pins every tarball under `overrides`, since the packages depend on each other. */
function localizeManifest(text: string, dir: string): string {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`--local: ${dir} is not a directory.`);
  const files = readdirSync(dir);
  const spec = (file: string) => `file:${join(dir, file).split(sep).join("/")}`;
  const manifest = JSON.parse(text);
  for (const field of ["dependencies", "devDependencies"]) {
    for (const dep of Object.keys(manifest[field] ?? {})) {
      if (!dep.startsWith("@gable/")) continue;
      const file = tarballFor(files, dep);
      if (!file) throw new Error(`--local: no tarball for ${dep} in ${dir}. Run "npm run pack:local <app-dir>" in the Gable repository first.`);
      manifest[field][dep] = spec(file);
    }
  }
  manifest.overrides = Object.fromEntries(
    files.flatMap((file) => {
      const match = /^gable-(.+?)-\d[^/]*\.tgz$/.exec(file);
      return match ? [[`@gable/${match[1]}`, spec(file)]] : [];
    }),
  );
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** Adds `name@range` to the manifest text's dependencies, keeping them sorted by name. */
function withDependency(text: string, name: string, range: string): string {
  const manifest = JSON.parse(text);
  const dependencies: Record<string, string> = { ...manifest.dependencies, [name]: range };
  manifest.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return JSON.stringify(manifest, null, 2) + "\n";
}

const VALID_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Copies the starter template into `targetDir`, substituting the name, the lockstep version and the commands. Returns the files written, relative to `targetDir`. */
export function scaffold(options: ScaffoldOptions): string[] {
  if (!VALID_NAME.test(options.name)) throw new Error(`"${options.name}" is not a valid package name (lowercase letters, digits and dashes).`);
  if (existsSync(options.targetDir) && readdirSync(options.targetDir).length > 0) throw new Error(`${options.targetDir} is not empty.`);
  const values: Record<string, string> = { name: options.name, version: ownVersion(), ...commandsFor(options.packageManager ?? "npm") };
  const localDir = options.localDir ? resolve(options.localDir) : undefined;
  const fill = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
  let manifest = fill(readFileSync(join(templateDir, "package.json"), "utf8"));
  if (options.serviceWorker) manifest = withDependency(manifest, "@gable/service-worker", `~${values.version}`);
  if (localDir) manifest = localizeManifest(manifest, localDir); // fails before anything is written
  const written = new Set<string>();
  const copy = (from: string, to: string, rel: string) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      const source = join(from, entry);
      const relative = rel ? `${rel}/${RENAMED[entry] ?? entry}` : (RENAMED[entry] ?? entry);
      if (statSync(source).isDirectory()) copy(source, join(to, entry), relative);
      else {
        writeFileSync(join(to, RENAMED[entry] ?? entry), relative === "package.json" ? manifest : fill(readFileSync(source, "utf8")));
        written.add(relative);
      }
    }
  };
  copy(templateDir, options.targetDir, "");
  if (options.serviceWorker) copy(serviceWorkerDir, options.targetDir, "");
  return [...written];
}

/** The terminal seam of {@link main}: pass real stdio in the bin, fakes in tests, so the CLI never touches `process` directly. */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Asks for the project name when none was given on the command line. */
  ask(question: string): Promise<string>;
}

const USAGE = `Usage: npm create gable@latest [project-name]

Copies the Gable starter into a new directory. Asks for a project name when none
is given.

Options:
  --service-worker  Add a service worker (@gable/service-worker): offline caching of the
                    production build and an update banner that applies new versions.
  --local <dir>     Install @gable/* from the tarballs in <dir> (made by "npm run pack:local"
                    in the Gable repository) instead of the registry. For unpublished builds.
`;

/** Runs create-gable and returns the exit code. */
export async function main(argv: string[], env: Record<string, string | undefined>, io: CliIo, cwd = process.cwd()): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }
  let localDir: string | undefined;
  let serviceWorker = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--service-worker") serviceWorker = true;
    else if (arg !== "--local" && !arg.startsWith("--local=")) positional.push(arg);
    else {
      localDir = arg === "--local" ? argv[++i] : arg.slice("--local=".length);
      if (!localDir || localDir.startsWith("-")) {
        io.stderr(`create-gable: --local needs a directory\n${USAGE}`);
        return 2;
      }
    }
  }
  argv = positional;
  const flag = argv.find((a) => a.startsWith("-"));
  if (flag || argv.length > 1) {
    io.stderr(`create-gable: ${flag ? `unknown option "${flag}"` : "expected at most one argument"}\n${USAGE}`);
    return 2;
  }
  const name = argv[0] ?? ((await io.ask("Project name: ")).trim() || "my-gable-app");
  const targetDir = resolve(cwd, name);
  const pm = detectPackageManager(env.npm_config_user_agent);
  try {
    scaffold({ name: basename(targetDir), targetDir, packageManager: pm, serviceWorker, localDir: localDir && resolve(cwd, localDir) });
  } catch (error) {
    io.stderr(`create-gable: ${(error as Error).message}\n`);
    return 1;
  }
  const { install, run } = commandsFor(pm);
  io.stdout(`\nCreated ${name}. Next:\n\n  cd ${name}\n  ${install}\n  ${run} dev\n`);
  return 0;
}
