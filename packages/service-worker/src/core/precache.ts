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
   * fully installed; rejects, leaving nothing of this version behind, when any URL fails or does not answer 200.
   * A version already installed is not fetched again. Pass it to the install event's `waitUntil`, so a failed
   * precache fails the worker's install and the running version stays in charge.
   */
  install(): Promise<void>;
  /**
   * Removes the caches other versions of this precache left behind. Pass it to the activate event's `waitUntil`:
   * by then the old worker no longer serves from them. Caches with other names are left alone.
   */
  activate(): Promise<void>;
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

/** Creates the precache for one release's `manifest`. */
export function createPrecache(scope: WorkerScope, manifest: PrecacheManifest, options: PrecacheOptions = {}): Precache {
  const name = options.name ?? "gable-precache";
  const cacheName = `${name}:${manifest.version}`;
  const origin = new URL(scope.origin).origin;
  const resolve = (url: string | URL | Request) => withoutFragment(new URL(url instanceof Request ? url.url : url, origin));
  const urls = [...new Set(manifest.urls.map(resolve))];
  const known = new Set(urls);
  const installedKey = new URL(INSTALLED_PATH, origin).href;
  let installed = false;

  async function isInstalled(): Promise<boolean> {
    if (!installed && (await scope.caches.has(cacheName))) {
      installed = (await (await scope.caches.open(cacheName)).match(installedKey)) !== undefined;
    }
    return installed;
  }

  const precache: Precache = {
    cacheName,

    async install() {
      if (await isInstalled()) return;
      // Whatever is there was left by an install that did not finish: start again from an empty cache.
      await scope.caches.delete(cacheName);
      const cache = await scope.caches.open(cacheName);
      try {
        await Promise.all(
          urls.map(async (url) => {
            const response = await scope.fetch(url, { cache: "no-cache" });
            if (response.status !== 200) throw new TypeError(`precache ${cacheName}: ${url} answered ${response.status}`);
            await cache.put(url, response);
          }),
        );
        await cache.put(installedKey, new Response(JSON.stringify({ version: manifest.version, urls })));
      } catch (error) {
        await scope.caches.delete(cacheName);
        throw error;
      }
      installed = true;
    },

    async activate() {
      const prefix = `${name}:`;
      const stale = (await scope.caches.keys()).filter((key) => key.startsWith(prefix) && key !== cacheName);
      await Promise.all(stale.map((key) => scope.caches.delete(key)));
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
