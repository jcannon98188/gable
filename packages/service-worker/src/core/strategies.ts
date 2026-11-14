// Caching strategies: route handlers that decide between the network and a named cache.
//
// Responses are stored through the fetch event's waitUntil, so the page gets its response without waiting for the
// cache write, and the worker stays alive until the write is done.
import type { FetchRouteContext, FetchRouteHandler } from "./router.js";

/** Options for the strategies that keep a cache. */
export interface CachingStrategyOptions {
  /** The cache the strategy reads and writes. Other caches are never read. */
  cacheName: string;
  /**
   * Whether a network response may be stored. Defaults to status 200 only, so errors, redirects and opaque
   * cross-origin responses (status 0) are not cached unless this allows them.
   */
  cacheable?: (response: Response) => boolean;
}

/** Options for {@link networkFirst}. */
export interface NetworkFirstOptions extends CachingStrategyOptions {
  /**
   * How long to wait for the network, in milliseconds, before answering from the cache. The network response is
   * still stored when it arrives. When nothing is cached the strategy keeps waiting for the network. Defaults to no
   * timeout.
   */
  networkTimeoutMs?: number;
}

const isOk = (response: Response) => response.status === 200;

/** Looks `request` up in the strategy's cache only. */
const fromCache = ({ request, scope }: FetchRouteContext, cacheName: string) => scope.caches.match(request, { cacheName });

/**
 * Fetches `request` and stores a cacheable response through the event's waitUntil. Called synchronously from the
 * handler, so the store is registered while the event is still being dispatched.
 */
function fetchAndStore(context: FetchRouteContext, options: CachingStrategyOptions): Promise<Response> {
  const { event, request, scope } = context;
  const cacheable = options.cacheable ?? isOk;
  const response = scope.fetch(request);
  event.waitUntil(
    response.then(
      async (fetched) => {
        if (!cacheable(fetched)) return;
        const copy = fetched.clone(); // taken before the page can read the body
        const cache = await scope.caches.open(options.cacheName);
        await cache.put(request, copy);
      },
      () => {}, // a failed fetch stores nothing; the strategy reports the failure
    ),
  );
  return response;
}

/**
 * Answers from the cache, going to the network only on a miss and storing what it gets. For assets whose URL
 * changes when their content does, such as hashed build output.
 */
export function cacheFirst(options: CachingStrategyOptions): FetchRouteHandler {
  return async (context) => (await fromCache(context, options.cacheName)) ?? fetchAndStore(context, options);
}

/**
 * Answers from the network and stores the response, falling back to the cache when the network fails or, with
 * {@link NetworkFirstOptions.networkTimeoutMs}, is slow. For data that should be fresh when it can be.
 */
export function networkFirst(options: NetworkFirstOptions): FetchRouteHandler {
  const timeout = options.networkTimeoutMs;
  return (context) => {
    const network = fetchAndStore(context, options);
    return new Promise<Response>((resolve, reject) => {
      const timer =
        timeout === undefined
          ? undefined
          : setTimeout(() => {
              fromCache(context, options.cacheName).then((hit) => hit && resolve(hit), () => {});
            }, timeout);
      network.then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (error: unknown) => {
          clearTimeout(timer);
          fromCache(context, options.cacheName).then(
            (hit) => (hit ? resolve(hit) : reject(error)),
            () => reject(error),
          );
        },
      );
    });
  };
}

/**
 * Answers from the cache when it can and refreshes the cached copy from the network in the background; on a miss it
 * waits for the network. For content where a slightly old copy now beats a fresh one later.
 */
export function staleWhileRevalidate(options: CachingStrategyOptions): FetchRouteHandler {
  return async (context) => {
    const network = fetchAndStore(context, options);
    return (await fromCache(context, options.cacheName)) ?? network;
  };
}

/** Always goes to the network and caches nothing. For requests that must never be answered from a cache. */
export function networkOnly(): FetchRouteHandler {
  return ({ request, scope }) => scope.fetch(request);
}
