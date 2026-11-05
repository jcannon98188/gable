import type { Scope } from "./scope.js";
import type { Renderer } from "./renderer.js";

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
