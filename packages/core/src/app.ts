import { InjectionToken, createInjector, type Injector, type Provider } from "./di.js";
import type { Renderer } from "./renderer.js";
import { instantiate, setInput, type ComponentClass } from "./component.js";
import type { InputSignal, ModelSignal } from "./input.js";

/** The Renderer of the running app; provided by `bootstrap` and read by `createComponent`. */
export const RENDERER = new InjectionToken<Renderer<any>>("Renderer");

/** Input values a component accepts, by field name. */
export type InputValues<T> = {
  [K in keyof T as T[K] extends InputSignal<any> | ModelSignal<any> ? K : never]?: T[K] extends InputSignal<infer V> | ModelSignal<infer V> ? V : never;
};

export interface CreateComponentOptions<T extends object, N> {
  /** Where `inject()` resolves from. Defaults to a fresh root injector. */
  injector?: Injector;
  /** Defaults to the injector's `RENDERER`. */
  renderer?: Renderer<N>;
  inputs?: InputValues<T>;
  /** An existing element to adopt as the host; otherwise one is created from the selector. */
  host?: N;
  /** Where to insert a created host. Omit to leave it detached (then place `ref.host` yourself). */
  parent?: N;
}

/** A live component created dynamically. */
export interface ComponentRef<T extends object, N> {
  readonly instance: T;
  readonly host: N;
  setInput<K extends keyof InputValues<T>>(name: K, value: InputValues<T>[K]): void;
  destroy(): void;
}

/** Creates a component without a template: used by the router, overlays, tests and `bootstrap`. */
export function createComponent<T extends object, N = unknown>(Class: ComponentClass<T>, options: CreateComponentOptions<T, N> = {}): ComponentRef<T, N> {
  const injector = options.injector ?? createInjector();
  const renderer = options.renderer ?? (injector.get(RENDERER) as Renderer<N> | null);
  if (!renderer) throw new Error("createComponent needs a renderer: pass { renderer } or provide RENDERER in the injector.");
  const mounted = instantiate(Class, {
    renderer,
    injector,
    host: options.host,
    parent: options.parent,
    inputs: options.inputs as Record<string, unknown> | undefined,
  });
  return {
    instance: mounted.instance,
    host: mounted.host,
    setInput: (name, value) => setInput(mounted.instance, name as string, value),
    destroy: mounted.destroy,
  };
}

export interface BootstrapOptions<N> {
  /** The renderer is always an argument, never a global. */
  renderer: Renderer<N>;
  /** Providers for the root injector. */
  providers?: Provider[];
  /** Opaque to the core; the renderer resolves it (DOM: a selector or element) and the root adopts that element as its host. */
  target?: unknown;
}

/** Starts an app: a root injector with the renderer, then the root component. */
export function bootstrap<T extends object, N = unknown>(Root: ComponentClass<T>, options: BootstrapOptions<N>): ComponentRef<T, N> {
  const { renderer } = options;
  let host: N | undefined;
  if (options.target !== undefined) {
    if (!renderer.resolveTarget) throw new Error("This renderer cannot resolve the target passed to bootstrap(): it has no resolveTarget operation.");
    host = renderer.resolveTarget(options.target);
  }
  const injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(options.providers ?? [])]);
  const ref = createComponent(Root, { renderer, injector, host });
  return {
    ...ref,
    destroy() {
      ref.destroy();
      injector.destroy();
    },
  };
}
