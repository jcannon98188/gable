// In-memory Cache and CacheStorage for the in-memory worker scope.
//
// Bodies are buffered when stored, so every match returns a fresh, readable Response. Not modelled: Vary matching
// (ignoreVary is accepted and has no effect), opaque responses, and Response.url on matched responses.

/** Turns a request argument into a Request, resolving relative URLs against the scope origin. */
export type ToRequest = (input: RequestInfo | URL, init?: RequestInit) => Request;

/** Makes the network request for `add` and `addAll`. */
export type Fetcher = (request: Request) => Promise<Response>;

interface Stored {
  readonly request: Request;
  readonly body: ArrayBuffer | null;
  readonly init: ResponseInit;
}

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

const withoutFragment = (url: string) => url.replace(/#.*$/, "");
const withoutSearch = (url: string) => url.replace(/[?#].*$/, "");

/** One named cache: Request to Response entries, at most one per URL and method GET. */
export class InMemoryCache implements Cache {
  readonly #entries = new Map<string, Stored>();
  readonly #toRequest: ToRequest;
  readonly #fetch: Fetcher;

  constructor(toRequest: ToRequest, fetcher: Fetcher) {
    this.#toRequest = toRequest;
    this.#fetch = fetcher;
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    const request = this.#toRequest(input);
    if (request.method !== "GET") throw new TypeError(`Cache.put: only GET requests can be cached, not ${request.method}`);
    if (response.status === 206) throw new TypeError("Cache.put: partial (206) responses cannot be cached");
    const body = NULL_BODY_STATUS.has(response.status) ? null : await response.arrayBuffer();
    const headers: [string, string][] = [];
    response.headers.forEach((value, key) => headers.push([key, value]));
    const key = withoutFragment(request.url);
    // Like the spec's batch operation: the old entry is removed and the new one appended.
    this.#entries.delete(key);
    this.#entries.set(key, { request, body, init: { status: response.status, statusText: response.statusText, headers } });
  }

  async add(input: RequestInfo | URL): Promise<void> {
    await this.addAll([input]);
  }

  async addAll(inputs: Iterable<RequestInfo | URL>): Promise<void> {
    const requests = [...inputs].map((input) => this.#toRequest(input));
    const responses = await Promise.all(requests.map((request) => this.#fetch(request)));
    responses.forEach((response, i) => {
      if (!response.ok) throw new TypeError(`Cache.addAll: ${requests[i]!.url} answered ${response.status}`);
    });
    for (let i = 0; i < requests.length; i++) await this.put(requests[i]!, responses[i]!);
  }

  async match(input: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined> {
    return (await this.matchAll(input, options))[0];
  }

  async matchAll(input?: RequestInfo | URL, options?: CacheQueryOptions): Promise<readonly Response[]> {
    return this.#find(input, options).map((entry) => new Response(entry.body === null ? null : entry.body.slice(0), entry.init));
  }

  async keys(input?: RequestInfo | URL, options?: CacheQueryOptions): Promise<readonly Request[]> {
    return this.#find(input, options).map((entry) => entry.request);
  }

  async delete(input: RequestInfo | URL, options?: CacheQueryOptions): Promise<boolean> {
    const found = this.#find(input, options);
    for (const entry of found) this.#entries.delete(withoutFragment(entry.request.url));
    return found.length > 0;
  }

  #find(input: RequestInfo | URL | undefined, options: CacheQueryOptions | undefined): Stored[] {
    const all = [...this.#entries.values()];
    if (input === undefined) return all;
    const request = this.#toRequest(input);
    if (request.method !== "GET" && !options?.ignoreMethod) return [];
    const normalize = options?.ignoreSearch ? withoutSearch : withoutFragment;
    const url = normalize(request.url);
    return all.filter((entry) => normalize(entry.request.url) === url);
  }
}

/** The origin's caches, by name, in creation order. */
export class InMemoryCacheStorage implements CacheStorage {
  readonly #caches = new Map<string, InMemoryCache>();
  readonly #toRequest: ToRequest;
  readonly #fetch: Fetcher;

  constructor(toRequest: ToRequest, fetcher: Fetcher) {
    this.#toRequest = toRequest;
    this.#fetch = fetcher;
  }

  async open(cacheName: string): Promise<InMemoryCache> {
    let cache = this.#caches.get(cacheName);
    if (!cache) {
      cache = new InMemoryCache(this.#toRequest, this.#fetch);
      this.#caches.set(cacheName, cache);
    }
    return cache;
  }

  async has(cacheName: string): Promise<boolean> {
    return this.#caches.has(cacheName);
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.#caches.delete(cacheName);
  }

  async keys(): Promise<string[]> {
    return [...this.#caches.keys()];
  }

  async match(input: RequestInfo | URL, options?: MultiCacheQueryOptions): Promise<Response | undefined> {
    if (options?.cacheName !== undefined) return this.#caches.get(options.cacheName)?.match(input, options);
    for (const cache of this.#caches.values()) {
      const hit = await cache.match(input, options);
      if (hit) return hit;
    }
    return undefined;
  }
}
