import { reportError } from "./errors.js";
import { createScope, runInScope, type Scope } from "./scope.js";
import { untracked } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { RENDERER } from "./app.js";
import { setup as hotSetup } from "./hot-data.js";
import { cleanupCalls, observeClears, watchTimers } from "./timer-watch.js";
import { InjectionToken, assertNoConstructor, createInjector, type Injector, type Provider } from "./di.js";
import { DEV, devtools, hooks, retireView, type Region, type Swap } from "./dev-hooks.js";
import { createEnv } from "./expression.js";
import { addAttribute, parseTemplate, type ElementNode, type TemplateResult } from "./template.js";
import { applyBindings, buildNodes } from "./view.js";
import { describeFields, inputOf } from "./input.js";
import { completeOutput } from "./output.js";
import { parseSelector } from "./select.js";
import { inReadPhase } from "./read-phase.js";
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
  /**
   * Type-level marker for tooling: `elements: pixiElements` (from `@gablejs/renderer-pixi/elements`) says this component's
   * template uses scene tags, so the language service types it against the Pixi element map. A renderer boundary
   * (`renderer`) implies it. Not read at runtime.
   */
  elements?: unknown;
  /** Defaults to `'scoped'`; the renderer owns the mechanism. */
  encapsulation?: "scoped" | "none";
  /** Stable id for style registration (HMR replaces styles by id). Defaults to the class name. */
  id?: string;
  /**
   * Declares a renderer boundary (ADR 0019). Called once per instance, right after Setup, with the instance and the
   * parent renderer and host. The host node stays in the parent renderer; this component's template, any slot content
   * projected into it and every component below are built with the returned renderer into the returned root node, in the
   * component's own scope and injector. The returned renderer's `providers` are layered as a child injector for the
   * subtree, where `RENDERER` is shadowed by the boundary renderer, and its `destroy()` runs when the component's scope
   * is disposed.
   */
  renderer?: (instance: any, parent: { renderer: Renderer<any>; host: unknown }) => RendererBoundary<any>;
}

/** What a `meta.renderer` factory returns: the renderer for the subtree and the node the template is built into. */
export interface RendererBoundary<M> {
  renderer: Renderer<M>;
  root: M;
}

/** A component is a plain class with `static meta`. No base class, no constructor. */
export interface ComponentClass<T extends object = object> {
  new (): T;
  meta: ComponentMeta;
}

/**
 * A component that has been instantiated and rendered against a renderer: its `instance`, its `host` node and a `destroy` that tears it down.
 */
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
  /** The root nodes `render` created (dev: DOM-state preservation across a rebuild). */
  nodes(): N[];
  /** True when Setup threw: the scope is disposed, `instance` is an empty object and `render` does nothing. */
  readonly failed: boolean;
}

const hostSpecs = new WeakMap<object, { host: unknown; spec: ElementNode }>();

/** Dev: a Setup started raw timers and registered no onCleanup, so nothing will clear them. */
function warnRawTimers(name: string, found: { setInterval: number; setTimeout: number }, detail = "in its Setup without onCleanup()"): void {
  for (const kind of ["setInterval", "setTimeout"] as const) {
    if (found[kind] === 0) continue;
    console.warn(`[gable] ${name || "A component"} started a raw ${kind} ${detail}, so a hot edit or unmount leaks the timer. Keep the timer state in a service (Frame hooks and fixed steps for game time), or clear it with onCleanup().`);
  }
}

function hostSpec(Class: ComponentClass<any>): ElementNode {
  const cached = hostSpecs.get(Class);
  // Keyed by the `meta.host` object too: a hot update swaps `meta` on the canonical class.
  let spec = cached && cached.host === Class.meta.host ? cached.spec : undefined;
  if (!spec) {
    spec = { type: "element", tag: "", attrs: [], bindings: [], events: [], models: [], refs: [], children: [] };
    for (const [key, value] of Object.entries(Class.meta.host ?? {})) addAttribute(spec, key, value);
    hostSpecs.set(Class, { host: Class.meta.host, spec });
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

/** The renderer and host node of the component whose Setup is running. */
export interface HostRef<N = unknown> {
  /** The renderer that owns the host node. */
  renderer: Renderer<N>;
  /** The component's host node (a DOM element under `@gablejs/renderer-dom`). */
  host: N;
}

/**
 * Returns the host node and renderer of the component whose Setup (field initialisers) is running, so a
 * directive-style class can attach listeners, attributes or ARIA state to its own element.
 * Like `inject()`, it only works during Setup; elsewhere it throws. Pass the renderer's node type
 * (`injectHost<HTMLElement>()`) to type `host`; use `renderer` rather than touching the node directly so the
 * code works with any Renderer. Safe to call in a helper that is itself called from a field initialiser.
 */
export function injectHost<N = unknown>(): HostRef<N> {
  if (!hostContext) throw new Error("injectHost() called outside a component Setup.");
  return hostContext as HostRef<N>;
}

/**
 * Dev only. The component that declares a renderer boundary is itself built by the parent renderer: the services of the boundary
 * renderer (a canvas's Frame, Keyboard, Pointer, Assets) reach the components of its template, not its own Setup. A missing provider
 * there is almost always that mistake, so the error says so.
 */
function withBoundaryHint<T>(name: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof Error && /^No provider for /.test(error.message)) {
      throw new Error(`${error.message} ${name} declares a renderer boundary (meta.renderer): the services of that renderer are provided to the components in its template, not to ${name}'s own Setup. Inject them in a child component.`, { cause: error });
    }
    throw error;
  }
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
  const tools = DEV ? devtools.current : null;
  try {
    return setUp();
  } catch (error) {
    scope.dispose();
    if (options.onSetupError === "throw" || (DEV && hooks.current?.strict())) throw error;
    reportError(error, "setup", scope);
    return { instance: {} as T, host, scope, render() {}, clear() {}, nodes: () => [], failed: true };
  }

  function setUp(): PreparedComponent<T, N> {
    return runInScope(scope, () => {
    // Field initialisers run owned by `scope`, in the component injector context.
    const queries = createQueryHost();
    const make = (): T => {
      const previous = hostContext;
      const previousHot = { active: hotSetup.active, store: hotSetup.store };
      hostContext = { renderer, host };
      try {
        hotSetup.active = true;
        hotSetup.store = dev?.hot;
        const build = () => inReadPhase("setup", () => (dev ? (dev.construct() as T) : new Class()));
        const construct = DEV && Class.meta.renderer ? () => withBoundaryHint(Class.name, build) : build;
        if (!DEV || !renderer.warnRawTimers) return construct();
        const before = cleanupCalls.count;
        const watched = watchTimers(construct);
        if (cleanupCalls.count === before) warnRawTimers(Class.name, watched);
        else if (watched.timers.length > 0) {
          // Some cleanup was registered, but that does not mean it clears these timers (Frame.onFrame and Assets.load register one too):
          // check at disposal which of them were really cleared.
          const { timers } = watched;
          scope.onDispose(() => {
            const stop = observeClears(timers);
            queueMicrotask(() => {
              stop();
              const left = { setInterval: 0, setTimeout: 0 };
              for (const timer of timers) if (!timer.settled) left[timer.kind]++;
              warnRawTimers(Class.name, left, "was not cleared by any onCleanup()");
            });
          });
        }
        return watched.value;
      } finally {
        hotSetup.active = previousHot.active;
        hotSetup.store = previousHot.store;
        hostContext = previous;
      }
    };
    const instance = declareQueries(queries, () => (own ? own.run(() => runInScope(scope, make)) : make()));
    for (const out of describeFields(instance, Class.name)) scope.onDispose(() => completeOutput(out));
    tools?.component({ Class, instance, host, scope, renderer, injector: own });
    // A renderer boundary: the view below this host is built with another renderer into its own root node.
    const boundary = Class.meta.renderer ? Class.meta.renderer(instance, { renderer, host }) : null;
    let viewInjector = own;
    if (boundary) {
      scope.onDispose(() => boundary.renderer.destroy?.());
      const layer = createInjector([{ provide: RENDERER, useValue: boundary.renderer }, ...(boundary.renderer.providers ?? [])], own);
      viewInjector = layer;
      scope.onDispose(() => layer.destroy());
    }
    const vr: Renderer<any> = boundary ? boundary.renderer : renderer;
    const vroot: any = boundary ? boundary.root : host;
    const env = createEnv(instance);
    env.view = {
      imports: applyOverrides(own, imports ?? []).filter((e): e is ComponentClass<any> => !isLazy(e)),
      lazies: applyOverrides(own, imports ?? []).filter(isLazy), injector: viewInjector, queries, content: options.content ?? null, scopeToken };
    if (scopeToken) renderer.setAttribute(host, scopeToken, "");
    // Host bindings are applied by render(), after the parent has bound inputs, so they may read required inputs.
    let hostBound = false;
    const bindHost = () => {
      if (hostBound) return;
      hostBound = true;
      runInScope(scope, () => inReadPhase("host binding", () => applyBindings(host, hostSpec(Class), renderer, env)));
    };
    let parts: Array<() => N[]> = [];
    // Dev: the view lives in its own scope so a hot update can rebuild it without touching Setup.
    let viewScope: Scope | null = null;
    const build = (into: Scope) =>
      runInScope(into, () => withContentTarget(null, () => buildNodes(parseTemplate(Class.meta.template!), vr, env, vroot, null)));
    const prepared: PreparedComponent<T, N> = {
      instance,
      host,
      scope,
      render() {
        bindHost();
        if (!Class.meta.template) return;
        if (DEV) viewScope = createScope(scope);
        parts = build(viewScope ?? scope);
      },
      nodes: () => parts.flatMap((part) => part()),
      clear() {
        for (const part of parts) for (const node of part()) vr.remove(node);
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
              const oldNodes = old.parts.flatMap((part) => part());
              retireView(vr, oldNodes, nextParts.flatMap((part) => part()), () => {
                parts = nextParts;
                viewScope = next;
                old.viewScope?.dispose();
                for (const node of oldNodes) vr.remove(node);
              });
            },
            abort() {
              next.dispose();
              for (const part of nextParts) for (const node of part()) vr.remove(node);
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
            const { scope, clear, nodes } = mounted;
            retireView(renderer, nodes(), next.nodes(), () => {
              Object.assign(mounted, { instance: next.instance, scope: next.scope, clear: next.clear, render: next.render, nodes: next.nodes });
              scope.dispose();
              clear();
            });
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
