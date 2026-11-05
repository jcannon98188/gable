import { createScope, runInScope, type Scope } from "./scope.js";
import type { Renderer } from "./renderer.js";
import { assertNoConstructor, createInjector, type Injector, type Provider } from "./di.js";
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
function registerComponentStyles(Class: ComponentClass<any>, renderer: Renderer<any>): string | null {
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
}

/** Runs a component's Setup (field initialisers) in its injection context and wires `meta.host`. */
export function prepare<T extends object, N>(Class: ComponentClass<T>, options: PrepareOptions<N>): PreparedComponent<T, N> {
  const { renderer, host } = options;
  const scope = createScope(options.parentScope);
  assertNoConstructor(Class);
  const { template, providers, imports } = Class.meta;
  const scopeToken = registerComponentStyles(Class, renderer);
  const own = providers ? (options.injector ?? createInjector()).createChild(providers, { host: true }) : options.injector;
  if (own && providers) scope.onDispose(() => own.destroy());
  return runInScope(scope, () => {
    // Field initialisers run owned by `scope`, in the component injector context.
    const queries = createQueryHost();
    const instance = declareQueries(queries, () => (own ? own.run(() => runInScope(scope, () => new Class())) : new Class()));
    for (const out of describeFields(instance, Class.name)) scope.onDispose(() => completeOutput(out));
    const env = createEnv(instance);
    env.view = {
      imports: (imports ?? []).filter((e): e is ComponentClass<any> => !isLazy(e)),
      lazies: (imports ?? []).filter(isLazy), injector: own, queries, content: options.content ?? null, scopeToken };
    if (scopeToken) renderer.setAttribute(host, scopeToken, "");
    applyBindings(host, hostSpec(Class), renderer, env);
    let parts: Array<() => N[]> = [];
    return {
      instance,
      host,
      scope,
      render() {
        if (template) parts = runInScope(scope, () => withContentTarget(null, () => buildNodes(parseTemplate(template), renderer, env, host, null)));
      },
      clear() {
        for (const part of parts) for (const node of part()) renderer.remove(node);
        parts = [];
      },
    };
  });
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
}

/** Instantiates a component as a root against a renderer; the seam beneath `createComponent`, `bootstrap` and `mount`. */
export function instantiate<T extends object, N>(Class: ComponentClass<T>, options: InstantiateOptions<N>): MountedComponent<T, N> & PreparedComponent<T, N> {
  const { renderer } = options;
  const adopted = options.host !== undefined;
  const host = options.host ?? renderer.createElement(parseSelector(Class.meta.selector).tag ?? "div", options.parent ?? null);
  stampSelector(Class, renderer, host);
  if (!adopted && options.parent !== undefined) renderer.insert(options.parent, host);
  const prepared = prepare(Class, { renderer, host, parentScope: options.parentScope ?? null, injector: options.injector ?? null });
  for (const [name, value] of Object.entries(options.inputs ?? {})) setInput(prepared.instance, name, value);
  prepared.render();
  return {
    ...prepared,
    destroy() {
      prepared.scope.dispose();
      if (adopted) prepared.clear();
      else renderer.remove(host);
    },
  };
}



/** Sets an input or model by name; unknown names are an error. */
export function setInput(instance: object, name: string, value: unknown): void {
  const handle = inputOf(instance, name);
  if (!handle) throw new Error(`${instance.constructor.name} has no input "${name}".`);
  handle.set(value);
}
