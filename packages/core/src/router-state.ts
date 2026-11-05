import { Subject, type Observable } from "rxjs";
import { toObservable } from "./rxjs.js";
import { INJECTOR, InjectionToken, inject, type Provider } from "./di.js";
import { reportError } from "./errors.js";
import { History, Location, Title } from "./platform.js";
import { currentScope, runInScope, type Scope } from "./scope.js";
import { computed, signal, untracked, type ReadonlySignal, type WritableSignal } from "./signals.js";
import { isLazy } from "./lazy.js";
import { hooks } from "./dev-hooks.js";
import { DEV } from "./dev-hooks.js";
import type { ComponentClass } from "./component.js";
import { matchRoutes, parseUrl, runGuard, toHref, type Match, type Route, type RouteSnapshot } from "./router-config.js";

export const ROUTES = new InjectionToken<readonly Route[]>("Routes");

/** Provides the Router and the route config: `bootstrap(Root, { providers: provideRouter(routes) })`. */
export function provideRouter(routes: readonly Route[]): Provider[] {
  return [{ provide: ROUTES, useValue: routes }, Router];
}

/** Router state for one level of nesting, injected by a routed component: `inject(ActiveRoute)`. */
export abstract class ActiveRoute {
  /** Path params of this route and its parents. */
  abstract readonly params: ReadonlySignal<Record<string, string>>;
  abstract readonly data: ReadonlySignal<Record<string, unknown>>;
  abstract readonly params$: Observable<Record<string, string>>;
  abstract readonly data$: Observable<Record<string, unknown>>;
}

/** The depth of the next `<router-outlet>` below this injector. */
export const OUTLET_DEPTH = new InjectionToken<number>("OutletDepth");

/** An active routed component slot, shared by successive navigations that keep the same route. */
export interface Level {
  route: Route;
  /** Index of the route in the matched chain. */
  readonly index: number;
  readonly component: ComponentClass<any>;
  readonly providers: Provider[];
  readonly active: ActiveRoute;
  /** Set by the outlet that renders it. */
  instance?: object;
  update(params: Record<string, string>, data: Record<string, unknown>): void;
}

export type NavigationEvent =
  | { type: "start"; id: number; url: string }
  | { type: "end"; id: number; url: string }
  | { type: "cancel"; id: number; url: string; reason: string }
  | { type: "error"; id: number; url: string; error: unknown };

export interface NavigationOutcome {
  /** `success` committed the URL; `cancelled` left everything as it was (guard, newer navigation, failed lazy load); `error` failed and was reported. */
  status: "success" | "cancelled" | "error";
  /** The URL the navigation ended on (after redirects), or the one asked for when it did not complete. */
  url: string;
  reason?: string;
  error?: unknown;
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
  state?: unknown;
}

interface RunOptions extends NavigateOptions {
  /** False for URL changes that came from the platform (back/forward) or the initial URL. */
  push: boolean;
}

const LAZY_FAILED = Symbol("lazy load failed");
const MAX_REDIRECTS = 10;

const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
};

const loadedComponents = new WeakMap<Route, ComponentClass<any>>();

/** The router: current URL state as signals with Observable twins, and `navigate`. */
export class Router {
  #injector = inject(INJECTOR);
  #routes: readonly Route[] = inject(ROUTES);
  #location = inject(Location);
  #history = inject(History);
  #title = inject(Title, { optional: true });
  #scope = currentScope();
  #id = 0;
  #chain: Route[] = [];
  #inflight = new Set<Promise<unknown>>();
  #events = new Subject<NavigationEvent>();
  #url = signal("");
  #params = signal<Record<string, string>>({}, { equal: shallowEqual });
  #queryParams = signal<Record<string, string | string[]>>({});
  #fragment = signal<string | null>(null);
  #data = signal<Record<string, unknown>>({}, { equal: shallowEqual });
  #navigating = signal(false);
  #tree = signal<readonly Level[]>([]);

  readonly url: ReadonlySignal<string> = this.#url;
  readonly params: ReadonlySignal<Record<string, string>> = this.#params;
  readonly queryParams: ReadonlySignal<Record<string, string | string[]>> = this.#queryParams;
  readonly fragment: ReadonlySignal<string | null> = this.#fragment;
  readonly data: ReadonlySignal<Record<string, unknown>> = this.#data;
  /** True while a navigation is in flight. */
  readonly navigating: ReadonlySignal<boolean> = this.#navigating;

  readonly url$ = this.#twin(this.#url);
  readonly params$ = this.#twin(this.#params);
  readonly queryParams$ = this.#twin(this.#queryParams);
  readonly fragment$ = this.#twin(this.#fragment);
  readonly data$ = this.#twin(this.#data);
  readonly navigating$ = this.#twin(this.#navigating);
  readonly events$: Observable<NavigationEvent> = this.#events.asObservable();

  // Follow the platform (back/forward), then take the initial URL.
  #follow = this.#location.subscribe((href, state) => void this.#start(href, { push: false, state }));
  #release = this.#scope?.onDispose(this.#follow);
  #initial = this.#start(this.#location.href, { push: false });
  _dev = DEV && hooks.current ? hooks.current.router({ scope: this.#scope, routes: () => this.#routes, replaceRoutes: (next) => this.#replaceRoutes(next as readonly Route[]) }) : undefined;

  #twin<T>(source: ReadonlySignal<T>): Observable<T> {
    return runInScope(this.#scope, () => toObservable(source));
  }

  /** Navigates to a URL (or path segments). Resolves, never rejects, with what happened. */
  navigate(target: string | readonly unknown[], options: NavigateOptions = {}): Promise<NavigationOutcome> {
    return this.#start(toHref(target), { ...options, push: true });
  }

  /** Resolves once no navigation is in flight (including the initial one). */
  async whenIdle(): Promise<void> {
    while (this.#inflight.size > 0) await Promise.allSettled([...this.#inflight]);
  }

  /** The Level rendered at `depth`, for `<router-outlet>`. */
  levelAt(depth: number): ReadonlySignal<Level | undefined> {
    return computed(() => this.#tree()[depth]);
  }

  /** Dev only (HMR): re-match an edited config against the current URL without guards, events or history changes. */
  #replaceRoutes(next: readonly Route[]): Promise<boolean> {
    const run = this.#rematch(next);
    this.#inflight.add(run);
    void run.finally(() => this.#inflight.delete(run));
    return run;
  }

  async #rematch(next: readonly Route[]): Promise<boolean> {
    const id = this.#id;
    const parsed = parseUrl(untracked(this.#url) || this.#location.href);
    const keepOld = (error: unknown): false => (reportError(error, "hmr", this.#scope, parsed.url), false);
    try {
      const match = await matchRoutes(next, parsed.segments, { children: (route) => this.#children(route), guard: async () => true });
      if (!Array.isArray(match) || match[match.length - 1]!.route.redirectTo !== undefined) {
        return keepOld(new Error(`The edited route config no longer matches "${parsed.url}"; keeping the previous route config.`));
      }
      await this.#loadComponents(match.map((m) => m.route));
      if (id !== this.#id) return false; // a navigation started meanwhile: it runs against the old config
      const resolve = (route: Route) => (route.component && isLazy(route.component) ? loadedComponents.get(route) : (route.component as ComponentClass<any> | undefined));
      const same = (a: Route, b: Route) => a.path === b.path && sameComponent(resolve(a), resolve(b)) && sameProviders(a.providers, b.providers);
      let keep = 0;
      while (keep < match.length && keep < this.#chain.length && same(this.#chain[keep]!, match[keep]!.route)) keep++;
      this.#routes = next;
      this.#commit(match, keep, parsed, { push: false });
      return true;
    } catch (error) {
      return error === LAZY_FAILED ? false : keepOld(error);
    }
  }

  #start(href: string, options: RunOptions): Promise<NavigationOutcome> {
    const run = this.#run(href, options, 0);
    this.#inflight.add(run);
    void run.finally(() => this.#inflight.delete(run));
    return run;
  }

  async #run(href: string, options: RunOptions, redirects: number): Promise<NavigationOutcome> {
    const id = ++this.#id;
    const parsed = parseUrl(href);
    const { url } = parsed;
    const stale = () => id !== this.#id;
    const cancel = (reason: string): NavigationOutcome => {
      this.#events.next({ type: "cancel", id, url, reason });
      return { status: "cancelled", url, reason };
    };
    const redirectTo = (target: string): Promise<NavigationOutcome> => {
      if (redirects >= MAX_REDIRECTS) throw new Error(`Too many redirects navigating to "${url}".`);
      this.#events.next({ type: "cancel", id, url, reason: "redirected" });
      // A redirect from a platform-initiated change must correct the URL the platform shows.
      return this.#run(target, { ...options, push: true, replace: options.push ? options.replace : true }, redirects + 1);
    };
    this.#navigating.set(true);
    this.#events.next({ type: "start", id, url });
    try {
      const match = await matchRoutes(this.#routes, parsed.segments, {
        children: (route) => this.#children(route),
        guard: (fn, ...args) => runGuard(this.#injector, fn, args),
      });
      if (stale()) return cancel("superseded");
      if (match && !Array.isArray(match)) return await redirectTo(match.redirect);
      if (!match) throw new Error(`No route matches "${url}".`);
      const leaf = match[match.length - 1]!;
      if (leaf.route.redirectTo !== undefined) return await redirectTo(substitute(leaf.route.redirectTo, merge(match)));

      const chain = match.map((m) => m.route);
      let keep = 0;
      while (keep < chain.length && chain[keep] === this.#chain[keep]) keep++;
      const snapshot = (upTo: number): RouteSnapshot => {
        const sub = match.slice(0, upTo + 1);
        return { url, params: merge(sub), data: mergeData(sub) };
      };

      const leaving = this.#tree().filter((level) => level.index >= keep).reverse();
      for (const level of leaving) {
        for (const guard of level.route.canDeactivate ?? []) {
          const verdict = await runGuard(this.#injector, guard, [level.instance, snapshot(chain.length - 1)]);
          if (stale()) return cancel("superseded");
          if (verdict !== true) return verdict === false ? cancel("guard") : await redirectTo(verdict.redirect);
        }
      }
      for (let i = keep; i < chain.length; i++) {
        for (const guard of chain[i]!.canActivate ?? []) {
          const verdict = await runGuard(this.#injector, guard, [snapshot(i)]);
          if (stale()) return cancel("superseded");
          if (verdict !== true) return verdict === false ? cancel("guard") : await redirectTo(verdict.redirect);
        }
      }

      await this.#loadComponents(chain.slice(keep));
      if (stale()) return cancel("superseded");

      this.#commit(match, keep, parsed, options);
      this.#events.next({ type: "end", id, url });
      return { status: "success", url };
    } catch (error) {
      if (stale()) return cancel("superseded");
      if (error === LAZY_FAILED) return cancel("lazy-load-failed");
      reportError(error, "router", this.#scope, url);
      this.#events.next({ type: "error", id, url, error });
      return { status: "error", url, error };
    } finally {
      if (!stale()) this.#navigating.set(false);
    }
  }

  async #children(route: Route): Promise<readonly Route[] | undefined> {
    const { children } = route;
    if (!children || !isLazy(children)) return children;
    try {
      const loaded = await children.loadExport();
      if (!Array.isArray(loaded)) throw new Error(`lazy(): the export "${children.name}" is not a Route[].`);
      return loaded as Route[];
    } catch (error) {
      reportError(error, "lazy", this.#scope, "route children");
      throw LAZY_FAILED;
    }
  }

  async #loadComponents(routes: Route[]): Promise<void> {
    try {
      await Promise.all(
        routes.map(async (route) => {
          const entry = route.component;
          if (entry && isLazy(entry)) loadedComponents.set(route, await entry.load());
        }),
      );
    } catch (error) {
      reportError(error, "lazy", this.#scope, "route component");
      throw LAZY_FAILED;
    }
  }

  #commit(match: Match[], keep: number, parsed: ReturnType<typeof parseUrl>, options: RunOptions): void {
    const old = this.#tree();
    const levels: Level[] = [];
    let providers: Provider[] = [];
    for (let i = 0; i < match.length; i++) {
      const { route } = match[i]!;
      providers = [...providers, ...(route.providers ?? [])];
      const component = route.component && (isLazy(route.component) ? loadedComponents.get(route) : route.component);
      if (!component) continue;
      const sub = match.slice(0, i + 1);
      const reused = i < keep ? old.find((l) => l.index === i) : undefined;
      if (reused) {
        reused.route = route;
        reused.update(merge(sub), mergeData(sub));
        levels.push(reused);
      } else levels.push(makeLevel(route, i, component, providers, merge(sub), mergeData(sub), this.#scope));
      providers = [];
    }
    this.#chain = match.map((m) => m.route);
    this.#tree.set(levels);
    this.#url.set(parsed.url);
    this.#params.set(merge(match));
    this.#queryParams.set(parsed.query);
    this.#fragment.set(parsed.fragment);
    this.#data.set(mergeData(match));
    if (options.push) {
      if (options.replace || parsed.url === this.#location.href) this.#history.replace(parsed.url, options.state);
      else this.#history.push(parsed.url, options.state);
    }
    const title = [...match].reverse().find((m) => m.route.title !== undefined)?.route.title;
    if (title !== undefined) this.#title?.set(title);
  }
}

const canonOf = (value: unknown) => (DEV && hooks.current ? hooks.current.canon(value) : value);
const sameComponent = (a: unknown, b: unknown) => canonOf(a) === canonOf(b);
function sameProviders(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  const canonProvider = (p: unknown) => {
    if (!p || typeof p !== "object") return canonOf(p);
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, k === "provide" || k === "useClass" || k === "useExisting" ? canonOf(v) : v]));
  };
  return a.length === b.length && a.every((p, i) => p === b[i] || (typeof p === "object" && typeof b[i] === "object" && p && b[i] ? shallowEqual(canonProvider(p) as Record<string, unknown>, canonProvider(b[i]) as Record<string, unknown>) : canonOf(p) === canonOf(b[i])));
}

function makeLevel(route: Route, index: number, component: ComponentClass<any>, providers: Provider[], params: Record<string, string>, data: Record<string, unknown>, scope: Scope | null): Level {
  const p: WritableSignal<Record<string, string>> = signal(params, { equal: shallowEqual });
  const d: WritableSignal<Record<string, unknown>> = signal(data, { equal: shallowEqual });
  const active: ActiveRoute = {
    params: p,
    data: d,
    params$: runInScope(scope, () => toObservable(p)),
    data$: runInScope(scope, () => toObservable(d)),
  };
  return {
    route,
    index,
    component,
    providers,
    active,
    update(nextParams, nextData) {
      p.set(nextParams);
      d.set(nextData);
    },
  };
}

function merge(match: readonly Match[]): Record<string, string> {
  return Object.assign({}, ...match.map((m) => m.params));
}

function mergeData(match: readonly Match[]): Record<string, unknown> {
  return Object.assign({}, ...match.map((m) => m.route.data ?? {}));
}

function substitute(target: string, params: Record<string, string>): string {
  return toHref(target.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? "")));
}
