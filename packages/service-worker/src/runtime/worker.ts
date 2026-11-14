// defineWorker: the default worker, built from a gable.sw.json config on core's public API, plus app extensions.
import {
  backgroundSync,
  cacheFirst,
  createFetchRouter,
  createPrecache,
  lifecycle,
  networkFirst,
  onNotificationClick,
  onPush,
  staleWhileRevalidate,
  type ActivateContext,
  type FetchRouter,
  type InstallContext,
  type LifecycleHook,
  type NotificationClickHandler,
  type Precache,
  type PushHandler,
  type SyncHandler,
  type UpdateContext,
  type WorkerNotificationOptions,
  type WorkerScope,
} from "../core/index.js";
import { isNonArrayObject, ServiceWorkerConfigError, validateConfig, type ServiceWorkerConfig } from "./config.js";
import { urlMatcher } from "./glob.js";
import { sortAssets, validateManifest, type AssetManifest } from "./manifest.js";

/** What {@link WorkerDefinitionOptions.extend} is given, once, when the worker starts. */
export interface WorkerExtendContext {
  /** The worker's global scope. Use it with core's API, for example `backgroundSync(self, ...)`. */
  readonly self: WorkerScope;
  /** The release's version, from the asset manifest. Pass it to core handlers that report to the app. */
  readonly version: string;
  /** The validated config. */
  readonly config: ServiceWorkerConfig;
  /** The asset manifest the worker started with. */
  readonly manifest: AssetManifest;
  /**
   * The worker's fetch router. Routes added here are tried before the declarative ones (precache, lazy assets,
   * navigation fallback, data groups), so they can also take over a URL the config covers.
   */
  readonly router: FetchRouter;
  /** The release's precache, the files of the config's prefetch asset groups. */
  readonly precache: Precache;
}

/**
 * Hooks and handlers an extension adds to the default worker. Every one is optional.
 *
 * The lifecycle hooks run inside the worker's own lifecycle steps, after its declarative work, so the app hears
 * `version-ready` only once they have finished too. A hook that fails fails its step and is reported to the app,
 * as with core's `lifecycle()`.
 */
export interface WorkerExtension {
  /** Runs while the release installs, after its precache is complete. */
  readonly install?: LifecycleHook<InstallContext>;
  /** Runs while the release activates, after the caches of earlier releases are removed. */
  readonly activate?: LifecycleHook<ActivateContext>;
  /** Runs when the app's `activateUpdate()` asks this waiting release to take over, before it does. */
  readonly update?: LifecycleHook<UpdateContext>;
  /** Handles pushes in place of the default, which shows the payload's `notification`. Pushes are still forwarded to the app. */
  readonly push?: PushHandler;
  /** Handles notification clicks in place of the default, which opens the notification's `data.url`. Clicks are still forwarded to the app. */
  readonly notificationClick?: NotificationClickHandler;
}

/** Options for {@link defineWorker}. */
export interface WorkerDefinitionOptions {
  /**
   * The config, typically `gable.sw.json` imported as JSON. A JSON import's types widen `"prefetch"` and the like
   * to `string`, so any object is accepted here; {@link defineWorker} validates it.
   */
  readonly config: ServiceWorkerConfig | Readonly<Record<string, unknown>>;
  /**
   * Adds to the declarative behaviour: routes on `context.router`, handlers through core's API on `context.self`,
   * and the hooks and handlers it returns.
   */
  readonly extend?: (context: WorkerExtendContext) => WorkerExtension | void;
  /**
   * Background sync handlers, keyed by the tag the app registers with `SwSync.register(tag)`. Each runs for the sync
   * events of its tag, through core's `backgroundSync()`: a handler that rejects fails the event so the browser
   * retries later, and the app hears of a failed last chance as a `runtime` error. Syncs of other tags are left to
   * other listeners. Browsers without Background Sync never run them.
   */
  readonly sync?: Readonly<Record<string, SyncHandler>>;
}

/** A worker built by {@link defineWorker}. The worker file starts it with its `self` and the build's asset manifest. */
export interface WorkerDefinition {
  /** The validated config. */
  readonly config: ServiceWorkerConfig;
  /**
   * Starts the worker on `self` for the release `manifest` describes: call it once, synchronously, when the worker
   * script runs, so its listeners are in place for the first events.
   * @returns a function that removes every listener the worker added.
   * @throws ServiceWorkerConfigError when the manifest is invalid or does not fit the config.
   */
  start(self: WorkerScope, manifest: AssetManifest): () => void;
}

/** Navigations the fallback leaves alone unless the config says otherwise: paths whose last segment looks like a file. */
const DEFAULT_FALLBACK_EXCLUDE = ["/**/*.*"];

/** Each release's lazy asset cache is `gable-lazy:<version>`; each data group's cache is `gable-data:<name>`. */
const LAZY_PREFIX = "gable-lazy:";
const DATA_PREFIX = "gable-data:";
const dataCacheName = (group: string) => DATA_PREFIX + group;

const withoutFragment = (url: URL) => url.href.replace(/#.*$/, "");

/** The default push handler: a JSON payload's `notification` with a string `title` is shown. */
const showPayloadNotification: PushHandler = ({ data, showNotification }) => {
  const notification = isNonArrayObject(data) ? data.notification : undefined;
  if (!isNonArrayObject(notification) || typeof notification.title !== "string") return;
  const { title, ...options } = notification;
  return showNotification(title, options as WorkerNotificationOptions);
};

/** The default click handler: a click on the notification itself opens its `data.url`. */
const openNotificationUrl: NotificationClickHandler = ({ action, notification, openWindow }) => {
  const url = isNonArrayObject(notification.data) ? notification.data.url : undefined;
  if (action === "" && typeof url === "string") return openWindow(url).then(() => {});
};

/** The `sync` option's handlers as [tag, handler] pairs; every problem is reported at once. */
function validateSyncHandlers(sync: WorkerDefinitionOptions["sync"]): [string, SyncHandler][] {
  if (sync === undefined) return [];
  if (!isNonArrayObject(sync)) throw new ServiceWorkerConfigError([{ path: "sync", message: "expected an object of handlers keyed by tag" }], "defineWorker options");
  const issues: { path: string; message: string }[] = [];
  const pairs: [string, SyncHandler][] = [];
  for (const [tag, handler] of Object.entries(sync)) {
    if (tag === "") issues.push({ path: 'sync[""]', message: "a tag must not be empty" });
    else if (typeof handler !== "function") issues.push({ path: `sync.${tag}`, message: "expected a handler function" });
    else pairs.push([tag, handler]);
  }
  if (issues.length) throw new ServiceWorkerConfigError(issues, "defineWorker options");
  return pairs;
}

/**
 * Defines the default worker: the declarative behaviour `config` describes, plus what `extend` adds.
 *
 * - Asset groups: prefetch files are precached while the release installs, atomically, with core's precache; lazy
 *   files are cached on first request. Both belong to the release and are removed when a later release activates.
 * - Data groups: `"freshness"` answers network first, `"performance"` from the cache with a background refresh.
 *   Their caches outlive releases; activation removes those of groups the config no longer has.
 * - The navigation fallback answers page navigations with the precached shell.
 * - Updates are app-controlled through core's `lifecycle()`: a release installs, tells the app it is ready, and
 *   takes over when the app calls `activateUpdate()`.
 * - Background sync: each handler of the `sync` option runs for the sync events of its tag, which the app registers
 *   with `SwSync`.
 * - Pushes and notification clicks are forwarded to the app. By default a push whose JSON payload has a
 *   `notification` object with a `title` shows it (its other fields are notification options), and a click on a
 *   notification whose `data.url` is a string opens that URL.
 *
 * Requests are answered by the first match, in this order: routes `extend` added, precached files, lazy files, the
 * navigation fallback, data groups. Anything else goes to the network.
 * @throws ServiceWorkerConfigError when `config` is invalid.
 */
export function defineWorker(options: WorkerDefinitionOptions): WorkerDefinition {
  const config = validateConfig(options.config);
  const syncHandlers = validateSyncHandlers(options.sync);
  return {
    config,
    start(self, input) {
      const manifest = validateManifest(config, input);
      const { version } = manifest;
      const origin = new URL(self.origin).origin;
      const assets = sortAssets(config, manifest);
      const precache = createPrecache(self, { version, urls: assets.prefetch });
      const lazy = new Set(assets.lazy.map((file) => withoutFragment(new URL(file, origin))));
      const lazyCache = LAZY_PREFIX + version;
      const router = createFetchRouter(self);
      const extension = options.extend?.({ self, version, config, manifest, router, precache }) ?? {};

      const stopLifecycle = lifecycle(self, {
        version,
        install: async (context) => {
          await precache.install();
          await extension.install?.(context);
        },
        activate: async (context) => {
          await precache.activate();
          const data = new Set((config.dataGroups ?? []).map((group) => dataCacheName(group.name)));
          const stale = (await self.caches.keys()).filter(
            (key) => (key.startsWith(LAZY_PREFIX) && key !== lazyCache) || (key.startsWith(DATA_PREFIX) && !data.has(key)),
          );
          await Promise.all(stale.map((key) => self.caches.delete(key)));
          await extension.activate?.(context);
        },
        update: (context) => extension.update?.(context),
      });
      const stopPush = onPush(self, { version, handle: extension.push ?? showPayloadNotification });
      const stopClicks = onNotificationClick(self, { version, handle: extension.notificationClick ?? openNotificationUrl });

      router
        .route((url) => precache.has(url), precache.handler)
        .route((url) => lazy.has(withoutFragment(url)), cacheFirst({ cacheName: lazyCache }));
      const fallback = config.navigationFallback;
      if (fallback) {
        const excluded = urlMatcher(fallback.exclude ?? DEFAULT_FALLBACK_EXCLUDE, origin);
        const shell = new URL(fallback.url, origin).href;
        router.route(
          (url, request) => request.mode === "navigate" && url.origin === origin && !excluded(url),
          async ({ request }) => (await precache.match(new Request(shell))) ?? self.fetch(request),
        );
      }
      for (const group of config.dataGroups ?? []) {
        const cacheName = dataCacheName(group.name);
        const handler =
          group.strategy === "freshness" ? networkFirst({ cacheName, networkTimeoutMs: group.timeoutMs }) : staleWhileRevalidate({ cacheName });
        router.route(urlMatcher(group.urls, origin), handler);
      }
      const syncs = syncHandlers.map(([tag, sync]) => backgroundSync(self, { tag, version, sync }));
      const stopRouter = router.listen();

      return () => {
        stopLifecycle();
        stopPush();
        stopClicks();
        for (const sync of syncs) sync.dispose();
        stopRouter();
      };
    },
  };
}
