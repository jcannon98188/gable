// Request routing for worker code: a fetch router picks the first route whose URL pattern, method and request
// destination match a fetch event, and answers the event with that route's handler.
import type { WorkerFetchEvent, WorkerScope } from "./scope.js";

/**
 * Which URLs a route matches.
 *
 * - A string starting with `/` is a path pattern: it matches requests to the worker's own origin whose whole path
 *   matches. `:name` matches one path segment and captures it as `params.name`; `*` matches any run of characters,
 *   slashes included, so `/assets/*` matches `/assets/img/logo.png`. The query string is ignored. This differs from
 *   the globs of the default worker's `gable.sw.json`, where `*` stays within one path segment and `**` crosses them.
 * - A string with `://` is an absolute pattern, matched the same way against the URL's origin and path, so
 *   `"https://fonts.example/*"` matches another origin.
 * - A RegExp is tested against the full URL; its named groups become params.
 * - A function decides for itself.
 */
export type FetchRoutePattern = string | RegExp | ((url: URL, request: Request) => boolean);

/** Options for {@link FetchRouter.route}. */
export interface FetchRouteOptions {
  /** The request methods the route matches, in any case, or `"*"` for every method. Defaults to `"GET"`. */
  method?: string | readonly string[];
  /**
   * The request destinations the route matches, as `Request.destination` reports them: `"document"` for a page
   * navigation, `"image"`, `"script"`, `"style"`, `"font"`, `""` for a `fetch()` call, and so on. Defaults to every
   * destination.
   */
  destination?: RequestDestination | readonly RequestDestination[];
}

/** What a {@link FetchRouteHandler} is given. */
export interface FetchRouteContext {
  /** The fetch event being answered. */
  readonly event: WorkerFetchEvent;
  /** The request being answered, the same as `event.request`. */
  readonly request: Request;
  /** The request's parsed URL. */
  readonly url: URL;
  /** The segments the route's pattern captured, by name. Empty when it captured none. */
  readonly params: Readonly<Record<string, string>>;
  /** The worker scope the router runs in. */
  readonly scope: WorkerScope;
}

/**
 * Answers a routed request. A caching strategy such as {@link cacheFirst} is a handler. A handler that throws or
 * rejects fails the request with a network error; it does not fall through to later routes.
 */
export type FetchRouteHandler = (context: FetchRouteContext) => Response | Promise<Response>;

/** Routes a worker's fetch events to handlers. Create one with {@link createFetchRouter}. */
export interface FetchRouter {
  /**
   * Adds a route. Routes are tried in the order they were added and the first match answers.
   * @returns the router, so routes can be chained.
   */
  route(pattern: FetchRoutePattern, handler: FetchRouteHandler, options?: FetchRouteOptions): FetchRouter;
  /**
   * Answers `event` with the first matching route, calling `event.respondWith`. Call it synchronously from a fetch
   * listener.
   * @returns whether a route matched. When none did the event is left alone and the request goes to the network,
   *   or to a later fetch listener.
   */
  handle(event: WorkerFetchEvent): boolean;
  /**
   * Listens for the scope's fetch events and handles each one.
   * @returns a function that stops listening.
   */
  listen(): () => void;
}

/** A fetch route as the router keeps it: its pattern compiled to a matcher, its methods and destinations as sets. */
interface CompiledFetchRoute {
  readonly match: (url: URL, request: Request) => Record<string, string> | undefined;
  readonly methods: ReadonlySet<string> | "*";
  readonly destinations: ReadonlySet<string> | undefined;
  readonly handler: FetchRouteHandler;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Compiles a path or absolute pattern to an anchored RegExp with a named group per `:param`. */
function compile(pattern: string): RegExp {
  let source = "";
  for (const [, param, star, literal] of pattern.matchAll(/:([A-Za-z_]\w*)|(\*)|([^:*]+|:)/g)) {
    source += param !== undefined ? `(?<${param}>[^/]+)` : star !== undefined ? ".*" : escapeRegExp(literal!);
  }
  return new RegExp(`^${source}$`);
}

const groups = (match: RegExpExecArray | null) => (match ? { ...match.groups } : undefined);

function matcher(pattern: FetchRoutePattern, origin: string): CompiledFetchRoute["match"] {
  if (typeof pattern === "function") return (url, request) => (pattern(url, request) ? {} : undefined);
  if (pattern instanceof RegExp) {
    return (url) => {
      pattern.lastIndex = 0;
      return groups(pattern.exec(url.href));
    };
  }
  if (pattern.startsWith("/")) {
    const regexp = compile(pattern);
    return (url) => (url.origin === origin ? groups(regexp.exec(url.pathname)) : undefined);
  }
  if (pattern.includes("://")) {
    const regexp = compile(pattern);
    return (url) => groups(regexp.exec(url.origin + url.pathname));
  }
  throw new TypeError(`fetch route pattern "${pattern}" must start with "/" or be an absolute URL`);
}

const asList = <T>(value: T | readonly T[]): readonly T[] => (Array.isArray(value) ? value : [value as T]);

/** Creates a fetch router for `scope`. Path patterns match requests to `scope.origin`. */
export function createFetchRouter(scope: WorkerScope): FetchRouter {
  const routes: CompiledFetchRoute[] = [];
  const origin = new URL(scope.origin).origin;

  const router: FetchRouter = {
    route(pattern, handler, options = {}) {
      const methods = asList(options.method ?? "GET").map((m) => m.toUpperCase());
      routes.push({
        match: matcher(pattern, origin),
        methods: methods.includes("*") ? "*" : new Set(methods),
        destinations: options.destination === undefined ? undefined : new Set(asList(options.destination)),
        handler,
      });
      return router;
    },

    handle(event) {
      const { request } = event;
      const url = new URL(request.url);
      for (const route of routes) {
        if (route.methods !== "*" && !route.methods.has(request.method.toUpperCase())) continue;
        if (route.destinations && !route.destinations.has(request.destination)) continue;
        const params = route.match(url, request);
        if (!params) continue;
        const context: FetchRouteContext = { event, request, url, params, scope };
        event.respondWith(new Promise<Response>((resolve) => resolve(route.handler(context))));
        return true;
      }
      return false;
    },

    listen() {
      const listener = (event: WorkerFetchEvent) => void router.handle(event);
      scope.addEventListener("fetch", listener);
      return () => scope.removeEventListener("fetch", listener);
    },
  };
  return router;
}
