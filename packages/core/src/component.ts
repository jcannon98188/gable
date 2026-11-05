import { reportError } from "./errors.js";
import { createScope, runInScope, type Scope } from "./scope.js";
import { untracked } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { DEV, InjectionToken, assertNoConstructor, createInjector, type Injector, type Provider } from "./di.js";
import { hooks, type Region, type Swap } from "./dev-hooks.js";
import { createEnv } from "./expression.js";
import { addAttribute, parseTemplate, type ElementNode, type TemplateResult } from "./template.js";
import { applyBindings, buildNodes } from "./view.js";
import { describeFields, inputOf } from "./input.js";
import { completeOutput } from "./output.js";
import { parseSelector } from "./select.js";
import { createQueryHost, declareQueries, withContentTarget } from "./query.js";
import { isLazy, type LazyEntry } from "./lazy.js";
import type { Content } from "./view-context.js";

/** Static component metadata. */
export interface ComponentMeta {
  selector: string;
  /** Absent on an attribute directive: it decorates a matching element and renders nothing of its own. */
  template?: TemplateResult;
  /** Components and attribute directives this template may use, plus `lazy()` entries (only inside `@defer`). */
  imports?: readonly (ComponentClass<any> | LazyEntry)[];
  /** Creates a child injector for this component and its descendants. */
  providers?: Provider[];
  /**
   * Host attributes, classes, styles and listeners, keyed like template attributes:
   * `role: 'button'`, `'[class.active]': 'isActive()'`, `'(click)': 'toggle()'`.
   */
  host?: Record<string, string>;
  /** CSS for this component. Scoped to it unless `encapsulation` is `'none'`. */
  styles?: string | readonly string[];
  /** Defaults to `'scoped'`; the renderer owns the mechanism. */
  encapsulation?: "scoped" | "none";
  /** Stable id for style registration (HMR replaces styles by id). Defaults to the class name. */
  id?: string;
}

/** A component is a plain class with `static meta`. No base class, no constructor. */
export interface ComponentClass<T extends object = object> {
  new (): T;
  meta: ComponentMeta;
}

export interface MountedComponent<T extends object, N> {
  readonly instance: T;
  readonly host: N;
  destroy(): void;
}

/** A component whose setup has run (instance and inputs exist) but whose view is not built yet. */
export interface PreparedComponent<T extends object, N> {
  readonly instance: T;
  readonly host: N;
  readonly scope: Scope;
  /** Builds the component's template into its host. */
  render(): void;
  /** Removes the nodes `render` created (for a host the component does not own). */
  clear(): void;
  /** True when Setup threw: the scope is disposed, `instance` is an empty object and `render` does nothing. */
  readonly failed: boolean;
}

const hostSpecs = new WeakMap<object, ElementNode>();

function hostSpec(Class: ComponentClass<any>): ElementNode {
  let spec = hostSpecs.get(Class);
  if (!spec) {
    spec = { type: "element", tag: "", attrs: [], bindings: [], events: [], models: [], refs: [], children: [] };
    for (const [key, value] of Object.entries(Class.meta.host ?? {})) addAttribute(spec, key, value);
    hostSpecs.set(Class, spec);
  }
  return spec;
}

const registeredStyles = new WeakMap<object, Map<string, { css: string; token: string }>>();

/** Registers a component's CSS with the renderer (once per id and CSS) and returns its scoping token, or null. */
export function registerComponentStyles(Class: ComponentClass<any>, renderer: Renderer<any>): string | null {
  const { styles, encapsulation, id } = Class.meta;
  const css = typeof styles === "string" ? styles : styles?.join("\n");
  if (!css || !renderer.registerStyles) return null;
  const key = id ?? Class.name;
  let byId = registeredStyles.get(renderer);
  if (!byId) registeredStyles.set(renderer, (byId = new Map()));
  let entry = byId.get(key);
  if (entry?.css !== css) byId.set(key, (entry = { css, token: renderer.registerStyles(key, css, { scoped: encapsulation !== "none" }) }));
  return entry.token || null;
}

export interface PrepareOptions<N> {
  renderer: Renderer<N>;
  /** The element this component decorates or renders into. */
  host: N;
  parentScope: Scope | null;
  injector: Injector | null;
  /** Template the parent projects into this component's slots. */
  content?: Content | null;
  /** What a Setup failure does: `report` it and carry on with an empty host (children), or `throw` it (roots). */
  onSetupError?: "report" | "throw";
}

/**
 * Test hook (dev only): replaces `meta.imports` entries (a component or a `lazy()` entry) for one injector tree.
 * A replacement must declare the selector of what it replaces.
 */
export const COMPONENT_OVERRIDES = new InjectionToken<ReadonlyMap<ComponentClass<any> | LazyEntry, ComponentClass<any> | LazyEntry>>("ComponentOverrides");

function applyOverrides(injector: Injector | null, imports: readonly (ComponentClass<any> | LazyEntry)[]): (ComponentClass<any> | LazyEntry)[] {
  const map = injector?.get(COMPONENT_OVERRIDES, { optional: true });
  if (!map) return [...imports];
  return imports.map((entry) => {
    const next = map.get(entry);
    if (!next) return entry;
    return isLazy(entry) && !isLazy(next) ? { kind: "lazy", name: entry.name, load: async () => next, loadExport: async () => next } satisfies LazyEntry : next;
  });
}

let hostContext: { renderer: Renderer<any>; host: unknown } | null = null;

/** Internal seam (router outlet and link directives): the renderer and host node of the component whose Setup is running. */
export function injectHost<N = unknown>(): { renderer: Renderer<N>; host: N } {
  if (!hostContext) throw new Error("injectHost() called outside a component Setup.");
  return hostContext as { renderer: Renderer<N>; host: N };
}

/** Runs a component's Setup (field initialisers) in its injection context and wires `meta.host`. */
export function prepare<T extends object, N>(Class: ComponentClass<T>, options: PrepareOptions<N>): PreparedComponent<T, N> {
  const { renderer, host } = options;
  const scope = createScope(options.parentScope);
  assertNoConstructor(Class);
  const { providers, imports } = Class.meta;
  const scopeToken = registerComponentStyles(Class, renderer);
  const own = providers ? (options.injector ?? createInjector()).createChild(providers, { host: true }) : options.injector;
  if (own && providers) scope.onDispose(() => own.destroy());
  scope.owner = { component: Class, injector: own ?? undefined };
  const dev = DEV ? hooks.current?.component(Class, own) : undefined;
  try {
    return setUp();
  } catch (error) {
    scope.dispose();
    if (options.onSetupError === "throw" || (DEV && hooks.current?.strict())) throw error;
    reportError(error, "setup", scope);
    return { instance: {} as T, host, scope, render() {}, clear() {}, failed: true };
  }

  function setUp(): PreparedComponent<T, N> {
    return runInScope(scope, () => {
    // Field initialisers run owned by `scope`, in the component injector context.
    const queries = createQueryHost();
    const make = (): T => {
      const previous = hostContext;
      hostContext = { renderer, host };
      try {
        return dev ? (dev.construct() as T) : new Class();
      } finally {
        hostContext = previous;
      }
    };
    const instance = declareQueries(queries, () => (own ? own.run(() => runInScope(scope, make)) : make()));
    for (const out of describeFields(instance, Class.name)) scope.onDispose(() => completeOutput(out));
    const env = createEnv(instance);
    env.view = {
      imports: applyOverrides(own, imports ?? []).filter((e): e is ComponentClass<any> => !isLazy(e)),
      lazies: applyOverrides(own, imports ?? []).filter(isLazy), injector: own, queries, content: options.content ?? null, scopeToken };
    if (scopeToken) renderer.setAttribute(host, scopeToken, "");
    applyBindings(host, hostSpec(Class), renderer, env);
    let parts: Array<() => N[]> = [];
    // Dev: the view lives in its own scope so a hot update can rebuild it without touching Setup.
    let viewScope: Scope | null = null;
    const build = (into: Scope) =>
      runInScope(into, () => withContentTarget(null, () => buildNodes(parseTemplate(Class.meta.template!), renderer, env, host, null)));
    const prepared: PreparedComponent<T, N> = {
      instance,
      host,
      scope,
      render() {
        if (!Class.meta.template) return;
        if (DEV) viewScope = createScope(scope);
        parts = build(viewScope ?? scope);
      },
      clear() {
        for (const part of parts) for (const node of part()) renderer.remove(node);
        parts = [];
        viewScope?.dispose();
        viewScope = null;
      },
      failed: false,
    };
    if (dev) {
      dev.done({
        instance,
        host,
        scope,
        renderer,
        injector: own,
        buildView(): Swap {
          env.view!.imports = (Class.meta.imports ?? []).filter((e): e is ComponentClass<any> => !isLazy(e));
          env.view!.lazies = (Class.meta.imports ?? []).filter(isLazy);
          const old = { parts, viewScope };
          const next = createScope(scope);
          let nextParts: Array<() => N[]>;
          try {
            nextParts = build(next);
          } catch (error) {
            next.dispose();
            throw error;
          }
          return {
            commit() {
              parts = nextParts;
              viewScope = next;
              old.viewScope?.dispose();
              for (const part of old.parts) for (const node of part()) renderer.remove(node);
            },
            abort() {
              next.dispose();
              for (const part of nextParts) for (const node of part()) renderer.remove(node);
            },
          };
        },
      });
    }
    return prepared;
    });
  }
}

/** Applies the selector's classes and attributes to a host element the component was given or created. */
export function stampSelector<N>(Class: ComponentClass<any>, renderer: Renderer<N>, host: N): void {
  const { classes, attrs } = parseSelector(Class.meta.selector);
  for (const [name, value] of attrs) renderer.setAttribute(host, name, value ?? "");
  for (const name of classes) renderer.setClass(host, name, true);
}

export interface InstantiateOptions<N> {
  renderer: Renderer<N>;
  /** Existing element to adopt as the host; otherwise one is created from the selector. */
  host?: N;
  /** Where to insert a created host. Omit to leave it detached. */
  parent?: N;
  parentScope?: Scope | null;
  injector?: Injector | null;
  /** Initial input values. */
  inputs?: Record<string, unknown>;
  /** Skip initial inputs the component does not declare instead of failing (the router feeds params this way). */
  lenientInputs?: boolean;
}

/** Instantiates a component as a root against a renderer; the seam beneath `createComponent`, `bootstrap` and `mount`. */
export function instantiate<T extends object, N>(Class: ComponentClass<T>, options: InstantiateOptions<N>): MountedComponent<T, N> & PreparedComponent<T, N> {
  const { renderer } = options;
  const adopted = options.host !== undefined;
  const host = options.host ?? renderer.createElement(parseSelector(Class.meta.selector).tag ?? "div", options.parent ?? null);
  stampSelector(Class, renderer, host);
  if (!adopted && options.parent !== undefined) renderer.insert(options.parent, host);
  let prepared: PreparedComponent<T, N>;
  try {
    prepared = prepare(Class, { renderer, host, parentScope: options.parentScope ?? null, injector: options.injector ?? null, onSetupError: "throw" });
  } catch (error) {
    if (!adopted) renderer.remove(host);
    throw error;
  }
  for (const [name, value] of Object.entries(options.inputs ?? {})) {
    if (options.lenientInputs && !inputOf(prepared.instance, name)) continue;
    setInput(prepared.instance, name, value);
  }
  prepared.render();
  const mounted: MountedComponent<T, N> & PreparedComponent<T, N> = {
    ...prepared,
    destroy() {
      mounted.scope.dispose();
      if (adopted) mounted.clear();
      else renderer.remove(host);
    },
  };
  if (DEV && hooks.current) {
    // Dev: a hot update re-sets-up a root beside the old one on the same host, then retires the old.
    const region: Region = {
      build(): Swap {
        const old = mounted.instance;
        const next = prepare(Class, { renderer, host, parentScope: options.parentScope ?? null, injector: options.injector ?? null, onSetupError: "throw" });
        try {
          for (const [name, value] of Object.entries(old)) {
            const from = inputOf(old, name);
            const to = inputOf(next.instance, name);
            if (!from || !to) continue;
            try {
              to.set(untracked(value as () => unknown));
            } catch {
              // an unset required input stays unset
            }
          }
          next.render();
        } catch (error) {
          next.scope.dispose();
          next.clear();
          throw error;
        }
        hooks.current?.region(next.scope, region);
        return {
          commit() {
            const { scope, clear } = mounted;
            Object.assign(mounted, { instance: next.instance, scope: next.scope, clear: next.clear, render: next.render });
            scope.dispose();
            clear();
          },
          abort() {
            next.scope.dispose();
            next.clear();
          },
        };
      },
    };
    hooks.current.region(prepared.scope, region);
  }
  return mounted;
}



/** Sets an input or model by name; unknown names are an error. */
export function setInput(instance: object, name: string, value: unknown): void {
  const handle = inputOf(instance, name);
  if (!handle) throw new Error(`${instance.constructor.name} has no input "${name}".`);
  handle.set(value);
}
