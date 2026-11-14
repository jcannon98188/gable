// A versioned precache: the files of one release, fetched on install into a cache named for that release.
//
// Atomicity rests on two rules. Each version has its own cache, so a worker only ever reads the release it was built
// with, and an install of a new version never touches the files the running version serves. And a version's cache
// counts as installed only once its completion record is written, after every file is stored, so a cache left
// behind by a failed or interrupted install is never served and is rebuilt from scratch.
import type { FetchRouteHandler } from "./router.js";
import type { WorkerScope } from "./scope.js";

/** The files of one release, as the build emits them. */
export interface PrecacheManifest {
  /** Identifies the release, such as a hash of every file's content. A new version installs into a new cache. */
  version: string;
  /** The URLs to precache, relative to the worker's origin or absolute. */
  urls: readonly string[];
  /**
   * The content hash of each file, by URL as listed in {@link urls}, which `install()` checks every fetched file against:
   * a file whose bytes do not hash to its entry fails the install. A hash is the first hex digits of the file's
   * SHA-256 digest, as `@gable/vite` emits them (16 digits), compared without regard to case. Files without an entry
   * are not verified, and entries for URLs not in {@link urls} are ignored.
   *
   * This is what keeps the cache to one release when a deploy lands mid-install: a file the server already answers
   * from the next release does not match this release's hash, so the install fails and the next worker installs the
   * new release whole. Verification needs `crypto.subtle`, which service workers have in browsers; where it is
   * missing (the AgniJS and QuickJS test engines) files are stored unverified.
   */
  hashes?: Readonly<Record<string, string>>;
}

/** Options for {@link createPrecache}. */
export interface PrecacheOptions {
  /**
   * The precache's name. Each version's cache is named `<name>:<version>`, and activation removes the other caches
   * with that prefix. Defaults to `"gable-precache"`.
   */
  name?: string;
}

/** A release's precache. Create one with {@link createPrecache}. */
export interface Precache {
  /** The name of this version's cache, `<name>:<version>`. */
  readonly cacheName: string;
  /**
   * Fetches every manifest URL into this version's cache, revalidating with the server. Resolves once the version is
   * fully installed; rejects, leaving nothing of this version behind, when any URL fails, does not answer 200 or,
   * where the manifest gives hashes, does not match its hash.
   * A version already installed is not fetched again, and a call made while the same version is installing in the
   * same Cache storage (from this precache or another one for that version) shares that install and its outcome; a
   * call after a failed install starts again. Pass it to the install event's `waitUntil`, so a failed
   * precache fails the worker's install and the running version stays in charge.
   */
  install(): Promise<void>;
  /**
   * Removes the caches other versions of this precache left behind. Pass it to the activate event's `waitUntil`:
   * by then the old worker no longer serves from them. Caches with other names are left alone.
   */
  activate(): Promise<void>;
  /**
   * Whether another release of this precache is installed in the same Cache storage: a version, other than this one,
   * whose cache carries the completion record. Caches of other names, and those a failed or interrupted install left
   * without the record, do not count. Until a newer release's {@link Precache.activate} removes it, an installed
   * release is the one in charge or the one a later release replaces, so this tells a first release (`false`) from an
   * update (`true`) even in a worker that was stopped and restarted between install and activate. Ask it before
   * {@link Precache.activate} runs, which removes the earlier releases. The default worker uses it to claim the
   * registering page on a first release only (`clients.claim()`), never when an update activates.
   */
  hasEarlierRelease(): Promise<boolean>;
  /** Whether `url`, resolved against the worker's origin and ignoring any fragment, is in the manifest. */
  has(url: string | URL | Request): boolean;
  /**
   * This version's response for `request`, or `undefined` when the request is not a GET for a manifest URL or this
   * version is not fully installed.
   */
  match(request: Request): Promise<Response | undefined>;
  /**
   * A route handler that answers from this version's precache and goes to the network when the version is not
   * installed. Route it to {@link has}: `router.route((url) => precache.has(url), precache.handler)`.
   */
  readonly handler: FetchRouteHandler;
}

/** The entry that records a fully installed version. It sorts with the app's URLs, under a reserved path. */
const INSTALLED_PATH = "/__gable-precache__/installed";

const withoutFragment = (url: URL) => url.href.replace(/#.*$/, "");

/**
 * The SHA-256 digest of `response`'s body in lowercase hex, or `undefined` where `crypto.subtle` is missing. Reads a
 * clone, so `response` can still be stored.
 */
async function sha256Hex(response: Response): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return undefined;
  const digest = new Uint8Array(await subtle.digest("SHA-256", await response.clone().arrayBuffer()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The installs in flight, by Cache storage and cache name. Concurrent installs of a version share one, since each would
 * otherwise start by deleting the cache the other is filling.
 */
const installing = new WeakMap<CacheStorage, Map<string, Promise<void>>>();

/** Creates the precache for one release's `manifest`. */
export function createPrecache(scope: WorkerScope, manifest: PrecacheManifest, options: PrecacheOptions = {}): Precache {
  const name = options.name ?? "gable-precache";
  const cacheName = `${name}:${manifest.version}`;
  const origin = new URL(scope.origin).origin;
  const resolve = (url: string | URL | Request) => withoutFragment(new URL(url instanceof Request ? url.url : url, origin));
  const urls = [...new Set(manifest.urls.map(resolve))];
  const known = new Set(urls);
  const expected = new Map<string, string>();
  for (const [url, hash] of Object.entries(manifest.hashes ?? {})) {
    const resolved = resolve(url);
    if (known.has(resolved)) expected.set(resolved, hash.toLowerCase());
  }
  const installedKey = new URL(INSTALLED_PATH, origin).href;
  let installed = false;

  async function isInstalled(): Promise<boolean> {
    if (!installed && (await scope.caches.has(cacheName))) {
      installed = (await (await scope.caches.open(cacheName)).match(installedKey)) !== undefined;
    }
    return installed;
  }

  async function installOnce(): Promise<void> {
    if (await isInstalled()) return;
    // Whatever is there was left by an install that did not finish: start again from an empty cache.
    await scope.caches.delete(cacheName);
    const cache = await scope.caches.open(cacheName);
    try {
      await Promise.all(
        urls.map(async (url) => {
          const response = await scope.fetch(url, { cache: "no-cache" });
          if (response.status !== 200) throw new TypeError(`precache ${cacheName}: ${url} answered ${response.status}`);
          const hash = expected.get(url);
          if (hash !== undefined) {
            const digest = await sha256Hex(response);
            if (digest !== undefined && (hash === "" || !digest.startsWith(hash))) {
              throw new TypeError(
                `precache ${cacheName}: ${url} does not match its manifest hash (expected ${hash}, got ${digest.slice(0, Math.max(hash.length, 16))}); ` +
                  `the server probably serves another release`,
              );
            }
          }
          await cache.put(url, response);
        }),
      );
      await cache.put(installedKey, new Response(JSON.stringify({ version: manifest.version, urls })));
    } catch (error) {
      await scope.caches.delete(cacheName);
      throw error;
    }
    installed = true;
  }

  const precache: Precache = {
    cacheName,

    install() {
      const inFlight = installing.get(scope.caches) ?? new Map<string, Promise<void>>();
      installing.set(scope.caches, inFlight);
      const shared = inFlight.get(cacheName);
      if (shared) return shared;
      const install = installOnce().finally(() => inFlight.delete(cacheName));
      inFlight.set(cacheName, install);
      return install;
    },

    async activate() {
      const prefix = `${name}:`;
      const stale = (await scope.caches.keys()).filter((key) => key.startsWith(prefix) && key !== cacheName);
      await Promise.all(stale.map((key) => scope.caches.delete(key)));
    },

    async hasEarlierRelease() {
      const prefix = `${name}:`;
      for (const key of await scope.caches.keys()) {
        if (!key.startsWith(prefix) || key === cacheName) continue;
        if ((await (await scope.caches.open(key)).match(installedKey)) !== undefined) return true;
      }
      return false;
    },

    has: (url) => known.has(resolve(url)),

    async match(request) {
      if (request.method !== "GET" || !precache.has(request) || !(await isInstalled())) return undefined;
      return scope.caches.match(resolve(request), { cacheName });
    },

    handler: async ({ request, scope: routed }) => (await precache.match(request)) ?? routed.fetch(request),
  };
  return precache;
}
