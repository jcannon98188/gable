import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
import { buildRegistry } from "./registry-build.js";
import type { RegistryIndex, RegistryItem } from "./types.js";

/** An opened registry: the index and a loader for single items. */
export interface Registry {
  index: RegistryIndex;
  /** Where it came from, for messages. */
  origin: string;
  item(name: string): RegistryItem;
  /** Removes the temporary clone of a git source. */
  dispose(): void;
}

export interface OpenOptions {
  /** The registry that ships with the CLI (`registry/` next to `dist/`), used when no source is given. */
  bundledDir: string;
  /** The CLI's own version; stamped on a registry generated from a source tree. */
  version: string;
  cwd: string;
}

/** True for a git remote (`https://...`, `ssh://`, `git@host:...`, `file://`, anything ending `.git`), optionally with `#ref`. */
export function isGitUrl(spec: string): boolean {
  return /^(https?|ssh|git|file):\/\//.test(spec) || /^git@[^:]+:/.test(spec) || /^git\+/.test(spec) || /\.git(#.*)?$/.test(spec);
}

const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** An item's file path must stay relative and inside the project's component or lib directory. */
function checkItem(item: RegistryItem, name: string): RegistryItem {
  if (item.name !== name) throw new Error(`Registry item "${name}" is named "${item.name}" inside its JSON.`);
  for (const file of item.files) {
    if (isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..")) throw new Error(`Registry item "${name}" has an unsafe file path "${file.path}".`);
  }
  return item;
}

function fromDirectory(dir: string, origin: string, dispose: () => void): Registry {
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as RegistryIndex;
  if (index.name !== "gable-ui" || index.formatVersion !== 1) throw new Error(`${origin} is not a gable-ui registry (index.json: name "${index.name}", formatVersion ${index.formatVersion}).`);
  return {
    index,
    origin,
    dispose,
    item(name) {
      const entry = index.items.find((i) => i.name === name);
      if (!entry || !SAFE_NAME.test(name)) throw new Error(`Registry ${origin} has no item "${name}".`);
      const file = resolve(dir, entry.path);
      if (!file.startsWith(resolve(dir) + sep)) throw new Error(`Registry item "${name}" points outside the registry (${entry.path}).`);
      return checkItem(JSON.parse(readFileSync(file, "utf8")) as RegistryItem, name);
    },
  };
}

async function fromDirectoryOrSourceTree(dir: string, origin: string, options: OpenOptions, dispose: () => void): Promise<Registry> {
  if (existsSync(join(dir, "index.json"))) return fromDirectory(dir, origin, dispose);
  if (existsSync(join(dir, "registry", "index.json"))) return fromDirectory(join(dir, "registry"), origin, dispose);
  if (existsSync(join(dir, "src", "components")) && existsSync(join(dir, "package.json"))) {
    // A gable-ui source tree (packages/ui): generate the registry from it on the fly.
    const built = await buildRegistry({ uiDir: dir, version: options.version });
    const byName = new Map(built.items.map((i) => [i.name, i]));
    return {
      index: built.index,
      origin,
      dispose,
      item(name) {
        const found = byName.get(name);
        if (!found) throw new Error(`Registry ${origin} has no item "${name}".`);
        return found;
      },
    };
  }
  throw new Error(`${origin} holds no registry: expected index.json, registry/index.json or a gable-ui source tree (src/components).`);
}

/**
 * Opens the registry `spec` names: nothing (the bundled one), a directory (a built registry, a folder with `registry/`
 * or a gable-ui source tree) or a git URL (`url` or `url#ref`, cloned shallow into a temporary directory).
 */
export async function openRegistry(spec: string | undefined, options: OpenOptions): Promise<Registry> {
  if (!spec) {
    if (!existsSync(join(options.bundledDir, "index.json"))) throw new Error(`The registry bundled with gable-ui is missing (${options.bundledDir}). Build the package ("npm run build") or pass --registry <dir|git-url>.`);
    return fromDirectory(options.bundledDir, "the bundled registry", () => {});
  }
  if (isGitUrl(spec)) {
    const hash = spec.lastIndexOf("#");
    const url = hash === -1 ? spec : spec.slice(0, hash);
    const ref = hash === -1 ? undefined : spec.slice(hash + 1);
    if (url.startsWith("-") || ref?.startsWith("-")) throw new Error(`"${spec}" is not a valid git URL.`);
    const tmp = mkdtempSync(join(tmpdir(), "gable-ui-registry-"));
    const dispose = () => rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    try {
      execFileSync("git", ["clone", "--depth", "1", ...(ref ? ["--branch", ref] : []), "--", url.replace(/^git\+/, ""), tmp], { stdio: "pipe" });
      return await fromDirectoryOrSourceTree(tmp, url, options, dispose);
    } catch (error) {
      dispose();
      const e = error as { stderr?: Buffer; message: string };
      throw new Error(`Could not read the registry at ${spec}: ${e.stderr?.toString().trim() || e.message}`);
    }
  }
  const dir = resolve(options.cwd, spec);
  if (!existsSync(dir)) throw new Error(`Registry directory ${dir} does not exist.`);
  return fromDirectoryOrSourceTree(dir, dir, options, () => {});
}
