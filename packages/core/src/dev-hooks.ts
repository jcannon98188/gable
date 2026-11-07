import type { Scope } from "./scope.js";
import type { Renderer } from "./renderer.js";

/** Dev-only checks are gated on this so bundlers can drop them (`define: { __GABLE_DEV__: false }`). */
declare const __GABLE_DEV__: boolean | undefined;
export const DEV = typeof __GABLE_DEV__ === "undefined" || __GABLE_DEV__ !== false;

// The only HMR code in the core: a slot the dev runtime (`@gable/core/hmr`) fills.
// Every use is behind `DEV && hooks.current`, so a production build drops all of it.

/** A two-phase swap: the new thing is built beside the old one; `commit` retires the old, `abort` discards the new. */
export interface Swap {
  commit(): void;
  abort(): void;
}

/** A piece of live UI that can be rebuilt in place: an element hosting components, or a root component. */
export interface Region {
  /** Builds the replacement beside the current content. Throws if it cannot. */
  build(): Swap;
}

export interface ComponentInfo {
  instance: object;
  host: unknown;
  scope: Scope;
  renderer: Renderer<any>;
  /** The component's own injector (set when it has `meta.providers`). */
  injector: object | null;
  /** Rebuilds the view of this same instance from the current `meta`. */
  buildView(): Swap;
}

/** What the runtime hands back around a construction (component or service). */
export interface Construction {
  /** Runs the initialisers through the current definition of the class. */
  construct(): object;
}

export interface ComponentBegin extends Construction {
  done(info: ComponentInfo): void;
}

/** Private injector operations the runtime needs, handed over by the injector itself. */
export interface InjectorOps {
  /** Resolved, class-constructed values by Token. */
  entries(): Array<[unknown, unknown]>;
  value(token: unknown): unknown;
  /** Constructs a replacement for a Token through its provider, without installing it. */
  build(token: unknown): unknown;
  install(token: unknown, value: unknown): void;
}

export interface ServiceInfo {
  instance: object;
  scope: Scope;
  injector: object;
}

export interface ServiceBegin extends Construction {
  done(info: ServiceInfo): void;
}

/** What the runtime needs of a live Router to apply an edited route config. */
export interface RouterOps {
  scope: Scope | null;
  /** The route config the router currently runs. */
  routes(): readonly unknown[];
  /** Re-matches `next` against the current URL and, if it still matches, adopts it. Resolves true when adopted; a mismatch is reported and resolves false. */
  replaceRoutes(next: readonly unknown[]): Promise<boolean>;
}

export interface DevHooks {
  /** Maps a class from a re-evaluated module to its canonical class. */
  canon<T>(token: T): T;
  component(Class: Function, ownInjector: object | null): ComponentBegin;
  service(Class: Function, injector: object): ServiceBegin;
  /** A Token was resolved to a class-built value in `injector`. */
  resolved(token: unknown, value: unknown, injector: object): void;
  /** `inject()` returned `value` to whatever is being constructed. */
  injected(value: unknown): void;
  injectorCreated(injector: object, ops: InjectorOps): void;
  router(ops: RouterOps): void;
  region(scope: Scope, region: Region): void;
  /** True while the runtime builds replacements: setup failures must throw, not be reported. */
  strict(): boolean;
}

export const hooks: { current: DevHooks | null } = { current: null };

/**
 * Dev: retires the old nodes of a rebuilt view around the renderer's optional DOM-state ops: captured before
 * anything is removed, restored onto the new nodes after. Best effort; a failure here never fails the update.
 */
export function retireView<N>(renderer: Renderer<N>, oldNodes: N[], newNodes: N[], retire: () => void): void {
  let token: unknown;
  try {
    token = renderer.captureViewState?.(oldNodes);
  } catch {
    token = undefined;
  }
  retire();
  if (token === undefined) return;
  try {
    renderer.restoreViewState?.(newNodes, token);
  } catch {
    // DOM state is a nicety
  }
}

// --- devtools --------------------------------------------------------------

/** What the router hands the devtools (dev only). */
export interface RouterDevInfo {
  scope: Scope | null;
  /** Current URL state, read untracked. */
  state(): { url: string; params: unknown; queryParams: unknown; fragment: unknown; data: unknown; navigating: boolean };
  routes(): readonly unknown[];
  /** The matched route chain, outermost first. */
  active(): readonly unknown[];
  /** Subscribes to navigation events; returns the unsubscribe. */
  events(listener: (event: unknown) => void): () => void;
  navigate(url: string): Promise<unknown>;
}

/** What the dev-only devtools layer (`devtools.ts`) receives from the runtime. Every call site is behind `DEV && devtools.current`. */
export interface DevtoolsSink {
  /** True while a client is connected: effect timings are only measured then. */
  timing: boolean;
  /** A signal or computed was created; `read` is its callable, `node` the underlying polyfill node. */
  signal(read: Function, node: object, kind: "state" | "computed", scope: Scope | null): void;
  /** `read` is an input or model wrapper over the signal `of`. */
  alias(read: Function, of: Function, kind: "input" | "model"): void;
  effect(node: object, scope: Scope): void;
  effectRun(node: object, ms: number, first: boolean): void;
  flushed(startedAt: number, ran: number, rounds: number): void;
  component(info: { Class: Function; instance: object; host: unknown; scope: Scope; renderer: Renderer<any>; injector: object | null }): void;
  injector(
    injector: object,
    parent: object | null,
    entries: () => Array<{ token: unknown; value: unknown; resolved: boolean; provider?: unknown }>,
    scope: Scope,
  ): void;
  router(info: RouterDevInfo): void;
  hmr(result: { status: string; errors: unknown[]; modules: string[]; changes?: HmrChange[] }): void;
  /** A module (by URL) exports `Class` (from the Vite plugin's accept line). */
  source(Class: Function, url: string): void;
  /** True while state history is recorded: only then does a write call `write`. Optional: an older sink has neither. */
  readonly recording?: boolean;
  /** A state node is about to be written (its value is still the old one). Only while `recording`. */
  write?(node: object): void;
}

export const devtools: { current: DevtoolsSink | null } = { current: null };

/** How a hot update changed one class: `patch` swapped members in place, `view` rebuilt the template, `resetup` re-ran the Setup. */
export interface HmrChange {
  name: string;
  kind: "none" | "patch" | "view" | "resetup";
}

// --- design tooling --------------------------------------------------------

/**
 * What the dev-only design layer (`designer.ts`, entry `@gable/core/designer`) receives from the runtime. It is a slot of
 * its own, not part of the devtools protocol: design tooling needs to see template nodes and intercept listeners, which an
 * inspection protocol should not offer. Every call site is behind `DEV && design.current`.
 */
export interface DesignSink {
  /** An element was built from template node `node` (an `ElementNode`; its `pos` says where in the source) of the component `instance`. */
  element(el: unknown, node: object, instance: object): void;
  /** A template event binding is about to be registered on `el`; returns the function to register instead. */
  listener(el: unknown, name: string, handler: (event: unknown) => void): (event: unknown) => void;
}

export const design: { current: DesignSink | null } = { current: null };
