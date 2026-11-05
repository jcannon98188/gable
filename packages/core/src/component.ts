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
import type { Content } from "./view-context.js";

/** Static component metadata. */
export interface ComponentMeta {
  selector: string;
  /** Absent on an attribute directive: it decorates a matching element and renders nothing of its own. */
  template?: TemplateResult;
  /** Components and attribute directives this template may use. */
  imports?: readonly ComponentClass<any>[];
  /** Creates a child injector for this component and its descendants. */
  providers?: Provider[];
  /**
   * Host attributes, classes, styles and listeners, keyed like template attributes:
   * `role: 'button'`, `'[class.active]': 'isActive()'`, `'(click)': 'toggle()'`.
   */
  host?: Record<string, string>;
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
  const own = providers ? (options.injector ?? createInjector()).createChild(providers, { host: true }) : options.injector;
  if (own && providers) scope.onDispose(() => own.destroy());
  return runInScope(scope, () => {
    // Field initialisers run owned by `scope`, in the component injector context.
    const queries = createQueryHost();
    const instance = declareQueries(queries, () => (own ? own.run(() => new Class()) : new Class()));
    for (const out of describeFields(instance, Class.name)) scope.onDispose(() => completeOutput(out));
    const env = createEnv(instance);
    env.view = { imports: imports ?? [], injector: own, queries, content: options.content ?? null };
    applyBindings(host, hostSpec(Class), renderer, env);
    return {
      instance,
      host,
      scope,
      render() {
        if (template) runInScope(scope, () => withContentTarget(null, () => buildNodes(parseTemplate(template), renderer, env, host, null)));
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
      if (!adopted) renderer.remove(host);
    },
  };
}



/** Sets an input or model by name; unknown names are an error. */
export function setInput(instance: object, name: string, value: unknown): void {
  const handle = inputOf(instance, name);
  if (!handle) throw new Error(`${instance.constructor.name} has no input "${name}".`);
  handle.set(value);
}
