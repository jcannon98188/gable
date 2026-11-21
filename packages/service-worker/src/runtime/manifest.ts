// The asset manifest: the build's list of emitted files, which the default worker sorts into its asset groups.
import { ServiceWorkerConfigError, type ServiceWorkerConfig, type ServiceWorkerConfigIssue } from "./config.js";
import { globToRegExp } from "./glob.js";

/**
 * What a production build emitted, the input the default worker caches from. `@gablejs/vite` writes it next to the
 * worker file; a hand-written worker can be given one too.
 *
 * The worker sorts `files` into the config's asset groups: each file belongs to the first group with a pattern that
 * matches it, and files no group matches are left to the network.
 */
export interface AssetManifest {
  /**
   * Identifies the release, such as a hash over every emitted file and the config. Any change makes a new release,
   * which installs into new caches and waits for the app's `activateUpdate()`.
   */
  readonly version: string;
  /**
   * Every emitted file, as a path from the origin's root such as `"/assets/app.3f9a1c.js"`. Requests match a file
   * only by exact URL, so list each file the way pages request it.
   */
  readonly files: readonly string[];
  /**
   * The content hash of each file in `files`, by path, in the format `@gablejs/vite` emits: the first 16 hex digits of
   * the file's SHA-256 digest. When present, the default worker checks every prefetch file it fetches against its
   * hash while the release installs, and fails the install on a mismatch (the precache's `hashes`).
   * Optional, so a hand-written manifest without hashes still works, unverified.
   */
  readonly hashes?: Readonly<Record<string, string>>;
}

/** A manifest's files sorted into the config's asset groups. Internal to the runtime. */
export interface SortedAssets {
  /** Files of prefetch groups, fetched while the release installs. */
  readonly prefetch: readonly string[];
  /** Files of lazy groups, fetched when first requested. */
  readonly lazy: readonly string[];
}

const pathOf = (file: string) => file.replace(/[?#].*$/, "");

/** Sorts `manifest`'s files into `config`'s asset groups; each file goes to the first group matching it. */
export function sortAssets(config: ServiceWorkerConfig, manifest: AssetManifest): SortedAssets {
  const groups = (config.assetGroups ?? []).map((group) => ({
    lazy: group.installMode === "lazy",
    patterns: group.files.map(globToRegExp),
  }));
  const prefetch: string[] = [];
  const lazy: string[] = [];
  for (const file of new Set(manifest.files)) {
    const group = groups.find(({ patterns }) => patterns.some((pattern) => pattern.test(pathOf(file))));
    if (group) (group.lazy ? lazy : prefetch).push(file);
  }
  return { prefetch, lazy };
}

/**
 * Checks that `manifest` is a valid {@link AssetManifest} and that `config` can run with it: the navigation
 * fallback's URL must be a file of a prefetch asset group, so the shell is there offline.
 * @returns the manifest.
 * @throws ServiceWorkerConfigError listing every problem found.
 */
export function validateManifest(config: ServiceWorkerConfig, manifest: unknown): AssetManifest {
  const issues: ServiceWorkerConfigIssue[] = [];
  const value = manifest as Partial<Record<keyof AssetManifest, unknown>> | null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ServiceWorkerConfigError([{ path: "(root)", message: "must be an object with version and files" }], "the asset manifest");
  }
  if (typeof value.version !== "string" || value.version === "") {
    issues.push({ path: "version", message: `must be a non-empty string, got ${JSON.stringify(value.version) ?? "nothing"}` });
  }
  if (!Array.isArray(value.files)) issues.push({ path: "files", message: "must be an array of paths" });
  else {
    value.files.forEach((file: unknown, index) => {
      if (typeof file !== "string" || !file.startsWith("/")) {
        issues.push({ path: `files[${index}]`, message: `must be a path starting with "/", got ${JSON.stringify(file) ?? "nothing"}` });
      }
    });
  }
  if (value.hashes !== undefined) {
    if (typeof value.hashes !== "object" || value.hashes === null || Array.isArray(value.hashes)) {
      issues.push({ path: "hashes", message: "must be an object of hashes by path" });
    } else {
      for (const [file, hash] of Object.entries(value.hashes)) {
        if (typeof hash !== "string" || hash === "") {
          issues.push({ path: `hashes[${JSON.stringify(file)}]`, message: `must be a non-empty hash string, got ${JSON.stringify(hash) ?? "nothing"}` });
        }
      }
    }
  }
  if (issues.length) throw new ServiceWorkerConfigError(issues, "the asset manifest");

  const valid = value as AssetManifest;
  const fallback = config.navigationFallback?.url;
  if (fallback !== undefined && !sortAssets(config, valid).prefetch.includes(fallback)) {
    const listed = valid.files.includes(fallback) ? "it is in the manifest but in no prefetch group" : "it is not in the manifest";
    throw new ServiceWorkerConfigError(
      [
        {
          path: "navigationFallback.url",
          message: `"${fallback}" must be a file of a prefetch asset group, so the app's shell is there offline; ${listed}`,
        },
      ],
      `gable.sw.json, with the manifest of release "${valid.version}",`,
    );
  }
  return valid;
}
