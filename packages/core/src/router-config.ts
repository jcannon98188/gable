import { isObservable, firstValueFrom, type Observable } from "rxjs";
import type { ComponentClass } from "./component.js";
import type { Injector, Provider } from "./di.js";
import type { LazyEntry } from "./lazy.js";
import type { FocusTarget, MetaTags } from "./platform.js";

/** What a guard sees of the navigation it guards. */
export interface RouteSnapshot {
  /** The URL being navigated to (for `canDeactivate`: the URL being left for). */
  url: string;
  /** Path params of this route, including those of its parents. */
  params: Record<string, string>;
  /** Static `data` of this route merged over its parents'. */
  data: Record<string, unknown>;
}

/** A guard result that sends the navigation elsewhere. Build one with `redirect(url)`. */
export interface Redirect {
  readonly redirect: string;
}

/**
 * Returns a guard result that sends the router to `url` instead of cancelling.
 *
 * @param url - Where to go instead.
 * @returns A `Redirect` for a guard to return.
 *
 * @example
 * ```ts
 * const requireLogin: CanActivateFn = () => (inject(Session).loggedIn() ? true : redirect("/login"));
 * ```
 */
export function redirect(url: string): Redirect {
  return { redirect: url };
}

/**
 * What a guard decides: `true` to allow, `false` to cancel the navigation, or a `redirect(url)` to go elsewhere.
 */
export type GuardResult = boolean | Redirect;
/**
 * What a guard may return: a {@link GuardResult}, or a promise or observable of one (the first value of an observable is used).
 */
export type GuardReturn = GuardResult | Promise<GuardResult> | Observable<GuardResult>;

/** Runs in an injection context (`inject()` works). Return `false` to cancel, `redirect(url)` to go elsewhere. */
export type CanActivateFn = (route: RouteSnapshot) => GuardReturn;
/**
 * Runs in an injection context before leaving a route; use it to confirm a navigation away from unsaved work. Receives the route's component instance and the route being left.
 *
 * @typeParam T - The component type.
 */
export type CanDeactivateFn<T = any> = (component: T, route: RouteSnapshot) => GuardReturn;
/** Decides whether a route may match at all; `false` lets matching continue with the next route. */
export type CanMatchFn = (segments: readonly string[]) => GuardReturn;

/** One entry of the route config handed to `provideRouter`. Plain data: no decorators, no modules. */
export interface Route {
  /** Static segments, `:param` segments, and an optional trailing `**` wildcard. `''` matches no segments. */
  path: string;
  /** A component, or `lazy(() => import('./page.js'), 'Page')`. */
  component?: ComponentClass<any> | LazyEntry;
  /** Child routes, or a `lazy()` entry naming an export that is a `Route[]`. */
  children?: readonly Route[] | LazyEntry;
  /** Creates an Injector for this route; its component and descendants resolve from it. */
  providers?: Provider[];
  data?: Record<string, unknown>;
  /** Written to the platform `Title` when this is the deepest route with a title. */
  title?: string;
  /** Document meta tags and canonical link. Merged from the root route down (children win, `og` and `twitter` per key) and applied to the platform `Meta` on every navigation, replacing the previous route's. */
  meta?: MetaTags;
  /** What the live region announces after navigating here: this text, or `false` for nothing. Default: the route title, then the page title (see `RouterOptions.announce`). The deepest route that sets it wins. */
  announce?: string | false;
  /** Where focus moves after navigating here: a CSS selector, a list tried in order, or `false` to leave focus alone. Default: `RouterOptions.focus`. The deepest route that sets it wins. */
  focus?: FocusTarget | false;
  /** Animates the swap to this route: `true` the router default mode, `"css"` or `"view"`; `false` opts out of a router-wide default. Overrides the outlet's `transition`. See "Transitions" in docs/router.md. */
  transition?: import("./transition.js").RouteTransitionSetting;
  /** Absolute URL to go to when this route matches in full; `:param` is replaced by the matched param. */
  redirectTo?: string;
  canActivate?: readonly CanActivateFn[];
  canDeactivate?: readonly CanDeactivateFn[];
  canMatch?: readonly CanMatchFn[];
}

export interface Match {
  route: Route;
  params: Record<string, string>;
}

export interface MatchContext {
  /** Loads the children a route names lazily; a failure is reported by the caller and ends matching. */
  children(route: Route): Promise<readonly Route[] | undefined>;
  /** Runs one guard in the router's injection context. */
  guard(fn: (...args: any[]) => GuardReturn, ...args: unknown[]): Promise<GuardResult>;
}

/** Runs a guard in `injector` and reduces Promise, Observable and plain results to a GuardResult. */
export async function runGuard(injector: Injector, fn: (...args: any[]) => GuardReturn, args: unknown[]): Promise<GuardResult> {
  const result = injector.run(() => fn(...args));
  const value = isObservable(result) ? await firstValueFrom(result) : await result;
  if (typeof value === "object" && value !== null && typeof (value as Redirect).redirect === "string") return value;
  return value === true;
}

/** First match wins: static, `:param` and trailing `**` segments, depth first with backtracking. */
export async function matchRoutes(routes: readonly Route[], segments: readonly string[], ctx: MatchContext): Promise<Match[] | Redirect | null> {
  for (const route of routes) {
    const taken = consume(route.path, segments);
    if (!taken) continue;
    let allowed = true;
    for (const guard of route.canMatch ?? []) {
      const verdict = await ctx.guard(guard, segments);
      if (verdict === true) continue;
      if (verdict !== false) return verdict; // a redirect ends matching
      allowed = false;
      break;
    }
    if (!allowed) continue;
    const { count, params } = taken;
    const rest = segments.slice(count);
    const match: Match = { route, params };
    if (route.redirectTo !== undefined) {
      if (rest.length === 0) return [match];
      continue;
    }
    const children = await ctx.children(route);
    if (children) {
      const below = await matchRoutes(children, rest, ctx);
      if (below) return Array.isArray(below) ? [match, ...below] : below;
      if (rest.length === 0 && route.component) return [match];
    } else if (rest.length === 0) return [match];
  }
  return null;
}

function consume(path: string, segments: readonly string[]): { count: number; params: Record<string, string> } | null {
  const pattern = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const want = pattern[i]!;
    if (want === "**") return { count: segments.length, params };
    const have = segments[i];
    if (have === undefined) return null;
    if (want.startsWith(":")) params[want.slice(1)] = have;
    else if (want !== have) return null;
  }
  return { count: pattern.length, params };
}

/** `/a b/c?x=1#f` into decoded path segments, the query and the fragment. */
export function parseUrl(href: string): { path: string; segments: string[]; query: Record<string, string | string[]>; fragment: string | null; url: string } {
  const parsed = new URL(href, "http://gable.invalid");
  const raw = parsed.pathname.split("/").filter(Boolean);
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of parsed.searchParams) {
    const have = query[key];
    query[key] = have === undefined ? value : Array.isArray(have) ? [...have, value] : [have, value];
  }
  const path = "/" + raw.join("/");
  const fragment = parsed.hash.length > 1 ? decodeURIComponent(parsed.hash.slice(1)) : null;
  return { path, segments: raw.map(decodeURIComponent), query, fragment, url: path + parsed.search + parsed.hash };
}

/** A string URL, or segments joined into an absolute one: `['users', 4]` is `/users/4`. */
export function toHref(target: string | readonly unknown[]): string {
  if (typeof target === "string") return target.startsWith("/") || target.startsWith("?") || target.startsWith("#") ? target : "/" + target;
  return "/" + target.map((s) => encodeURIComponent(String(s).replace(/^\/+/, ""))).join("/");
}
