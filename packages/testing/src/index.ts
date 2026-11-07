import { COMPONENT_OVERRIDES, DEFER_BLOCKS, flushSync, hasPendingFlush, instantiate, whenFlushed, type DeferHandle, type MountedComponent } from "@gable/core/internal";
import { ErrorHandler, type InputValues, I18n, provideI18n, type I18nOptions, type Injector, type ComponentClass, type ErrorContext, type ErrorSource, type LazyEntry, type Provider } from "@gable/core";
import { applyUpdate, type HotResult } from "@gable/core/hmr";
import { createTestInjector, httpTesting } from "./injector.js";
import { HttpBackend, mockHttp } from "@gable/core/http";
import { HttpTestingBackend } from "./http.js";
import type { Renderer } from "@gable/core/renderer";
import type { ComponentScenes } from "@gable/core/tooling";
import { Router, provideRouter, type NavigateOptions, type NavigationOutcome, type Route, type RouterAccessibilityOptions } from "@gable/core/router";
import type { TestPlatform } from "./platform.js";
import { createTestRenderer, type TestRenderer, createTestRoot, query, queryAll, serialize, textContent, type TestNode } from "./renderer.js";

export type { TestNode, TestRenderer } from "./renderer.js";
export { createTestPlatform } from "./platform.js";
export type { TestPlatform } from "./platform.js";
export type { DeferHandle as DeferBlock, DeferState } from "@gable/core/internal";
export type { HotResult } from "@gable/core/hmr";

/** One failure delivered to the ErrorHandler. */
export interface ErrorReport {
  error: unknown;
  context: ErrorContext;
}

export interface MountOptions<T extends object = object> {
  /** Defaults to the in-memory test renderer. */
  renderer?: Renderer<TestNode>;
  /** Values for the component's inputs (`input()` and `model()` fields) at creation. */
  inputs?: InputValues<T>;
  /** Providers for the root injector; override any Token. */
  providers?: Provider[];
  /**
   * Starts the in-memory `I18n` service in a locale with catalogs, e.g. `{ locale: "fr", catalogs: { fr: { [id]: "Bonjour" } } }`
   * (see `messageId` in `@gable/core/i18n`, or use explicit `@@id`s). Missing translations are collected in
   * `fixture.i18n.missing` instead of warning on the console.
   */
  i18n?: I18nOptions;
  /**
   * `[[Child, Stub]]`: for this test only, replaces an imported component or a `lazy()` entry.
   * The stub must declare the selector of what it replaces (a lazy entry may be replaced by a component).
   */
  overrides?: ReadonlyArray<readonly [ComponentClass<any> | LazyEntry, ComponentClass<any> | LazyEntry]>;
  /**
   * Advances the runner fake clock by `ms` (what `advance` calls). Defaults to the `vi` or `jest`
   * global's `advanceTimersByTimeAsync` when present; gable owns no clock.
   */
  advanceTimers?: (ms: number) => void | Promise<void>;
}

/** Collected ErrorHandler reports. */
export interface ErrorExpectations {
  /** Returns and clears the collected reports (only those from `source` when given), so they no longer fail the test. */
  expect(source?: ErrorSource): ErrorReport[];
}

/** A mounted component under test. It never flushes on its own: call `flush()`. */
export interface Fixture<T extends object> {
  readonly instance: T;
  /** The root injector (providers, overrides and the collecting ErrorHandler included). */
  readonly injector: Injector;
  /** The root `I18n` service: `await fixture.i18n.setLocale("de")` then `flush()`, or `register` a catalog, to test translated UI. */
  readonly i18n: I18n;
  /** The host element node. */
  readonly root: TestNode;
  /** Every live `@defer` block, in creation order: drive each with `trigger()`, read its `state`, await `settle()`. */
  readonly defer: readonly DeferHandle[];
  /** The recording HttpBackend: `expectOne`, `expectNone`, `match`, `verify`. `destroy()` verifies it. */
  readonly http: HttpTestingBackend;
  query(selector: string): TestNode | null;
  queryAll(selector: string): TestNode[];
  /** Concatenated text of the host's subtree. */
  text(): string;
  /** Concatenated text of any node's subtree (`TestNode.text` is only the node's own text). */
  textOf(node: TestNode): string;
  /** Stable pretty-printed markup of the host's subtree (empty once destroyed). */
  html(): string;
  /**
   * Resolves after the next scheduled flush has applied pending updates. Rejects
   * with any error reported since the last flush that a test has not claimed
   * (the first error itself, or an AggregateError for several).
   */
  flush(): Promise<void>;
  /**
   * Flushes until nothing is scheduled (covering bound Promises and Observables that
   * resolve in microtasks), then rethrows unclaimed error reports like `flush()`.
   */
  settle(): Promise<void>;
  /** Runs pending effects now, then throws unclaimed error reports. */
  flushSync(): void;
  /** Advances the runner fake timers by `ms` (debounce, `validateAsync`, `@defer` timers), then settles. */
  advance(ms: number): Promise<void>;
  readonly errors: ErrorExpectations;
  /** Same as `errors.expect()`. */
  claimErrors(): ErrorReport[];
  /**
   * Replays a hot update through the real HMR path (dev only). Each argument is a new version of a class (matched
   * to the live class of the same name), a module namespace object (`{ Counter, hmr: 'reset' }`), or an `Error`
   * standing for a module that failed to evaluate. All arguments form one transaction.
   */
  hotReplace(...updates: Array<Function | Record<string, unknown> | Error>): HotResult;
  /** Fires an event on a node as if the renderer had emitted it (calls its listeners). */
  dispatch(target: TestNode, name: string, event?: unknown): void;
  /**
   * Edits a form control as a user would: a string types text or chooses an option, a boolean checks or unchecks
   * (a radio is chosen with `true`). Sets the control's property, then fires its `input` or `change` event.
   */
  fill(target: TestNode, value: string | boolean): void;
  /**
   * Types into a control the way a browser does: sets its `value`, then fires `input` with a realistic event
   * (`$event.target.value` is the typed text). Use it for plain controls whose handler reads `$event`.
   */
  type(target: TestNode, text: string): void;
  /**
   * Fires `change` with a realistic event: a string sets `value`, a boolean sets `checked`
   * (`$event.target.value` / `$event.target.checked`). Omit `value` to fire it on the control as it is.
   */
  change(target: TestNode, value?: string | boolean): void;
  /**
   * Fires `keydown` with a realistic event (`$event.key`, `$event.code`, modifiers, `$event.target`).
   * `init` overrides or adds any event field, e.g. `{ shiftKey: true }`.
   */
  keydown(target: TestNode, key: string, init?: Record<string, unknown>): void;
  /** The control loses focus (a `[field]` marks its field touched). */
  blur(target: TestNode): void;
  /** Destroys the component, then fails with any unmatched HTTP request or error report the test never expected. Safe to call twice. */
  destroy(): void;
  [Symbol.dispose](): void;
}

const live = new Set<{ destroy(): void }>();
let hooked = false;
/** Registers auto-cleanup with the runner's `afterEach` when it is a global; otherwise tests call `destroy()` or use `using`. */
function hookCleanup(): void {
  if (hooked) return;
  const afterEach = (globalThis as { afterEach?: (fn: () => void) => void }).afterEach;
  if (typeof afterEach !== "function") return;
  hooked = true;
  afterEach(() => {
    const errors: unknown[] = [];
    for (const fixture of [...live]) {
      try {
        fixture.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} fixtures had unexpected error reports`);
  });
}

function defaultAdvance(ms: number): void | Promise<void> {
  const g = globalThis as Record<string, any>;
  const clock = g.vi ?? g.jest;
  const fn = clock?.advanceTimersByTimeAsync ?? clock?.advanceTimersByTime;
  if (!fn) throw new Error("advance(ms) needs fake timers: pass mount(..., { advanceTimers }) or expose your runner's `vi`/`jest` global.");
  return fn.call(clock, ms);
}

/** A DOM-like view of a node: `value`, `checked` and friends read and write the node's live props. */
function targetOf(node: TestNode): Record<string, unknown> {
  const view: Record<string, unknown> = { tagName: (node.tag ?? "").toUpperCase(), nodeName: (node.tag ?? "").toUpperCase(), node };
  for (const key of ["value", "checked", "selectedIndex"]) {
    Object.defineProperty(view, key, { enumerable: true, get: () => node.props[key], set: (v) => void (node.props[key] = v) });
  }
  for (const key of ["id", "name", "type", "className"]) {
    Object.defineProperty(view, key, { enumerable: true, get: () => node.props[key] ?? node.attrs[key === "className" ? "class" : key] });
  }
  return view;
}

function eventFor(node: TestNode, type: string, init: Record<string, unknown> = {}): Record<string, unknown> {
  const target = targetOf(node);
  const event: Record<string, unknown> = {
    type,
    target,
    currentTarget: target,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
    ...init,
  };
  return event;
}

const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
let fixtures = 0;

export function mount<T extends object>(Component: ComponentClass<T>, options: MountOptions<T> = {}): Fixture<T> {
  const renderer = options.renderer ?? createTestRenderer();
  const container = createTestRoot();
  (renderer as Partial<TestRenderer>).setOverlayContainer?.(container);
  const reports: Array<ErrorReport & { surfaced: boolean }> = [];
  class Collector extends ErrorHandler {
    override handleError(error: unknown, context: ErrorContext): void {
      reports.push({ error, context, surfaced: false });
    }
  }
  const defer: DeferHandle[] = [];
  hookCleanup();
  const injector = createTestInjector([{ provide: DEFER_BLOCKS, useValue: defer }, { provide: ErrorHandler, useClass: Collector }, ...provideI18n({ onMissing: () => {}, ...options.i18n }), { provide: COMPONENT_OVERRIDES, useValue: new Map(options.overrides ?? []) }, ...(options.providers ?? [])]);
  const mounted = instantiate(Component, { renderer, parent: container, injector, inputs: options.inputs as Record<string, unknown> | undefined });
  // Overlay content (portals) lives under the mounted host, so fixture queries and serialisation see it.
  (renderer as Partial<TestRenderer>).setOverlayContainer?.(mounted.host);
  let destroyed = false;
  const unclaimed = () => {
    const fresh = reports.filter((r) => !r.surfaced);
    for (const r of fresh) r.surfaced = true;
    if (fresh.length === 1) throw fresh[0]!.error;
    if (fresh.length > 1) throw new AggregateError(fresh.map((r) => r.error), `${fresh.length} unclaimed errors were reported`);
  };
  const expectErrors = (source?: ErrorSource): ErrorReport[] => {
    const taken: ErrorReport[] = [];
    for (let i = 0; i < reports.length; ) {
      const { error, context } = reports[i]!;
      if (source === undefined || context.source === source) {
        taken.push({ error, context });
        reports.splice(i, 1);
      } else i++;
    }
    return taken;
  };
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      await tick();
      if (!hasPendingFlush()) break;
      await whenFlushed();
    }
    unclaimed();
  };
  const moduleUrl = `gable-test://fixture-${++fixtures}`;
  const fixture: Fixture<T> = {
    get instance() {
      return mounted.instance;
    },
    injector,
    get i18n() {
      return injector.get(I18n)!;
    },
    root: mounted.host,
    defer,
    get http() {
      return httpTesting(injector);
    },
    query: (selector) => query(mounted.host, selector),
    queryAll: (selector) => queryAll(mounted.host, selector),
    text: () => textContent(mounted.host),
    textOf: textContent,
    html: () => (destroyed ? "" : serialize(mounted.host)),
    flush: async () => {
      await whenFlushed();
      unclaimed();
    },
    settle,
    flushSync: () => {
      flushSync();
      unclaimed();
    },
    advance: async (ms) => {
      await (options.advanceTimers ?? defaultAdvance)(ms);
      await settle();
    },
    errors: { expect: expectErrors },
    claimErrors: () => expectErrors(),
    hotReplace(...updates) {
      const exports: Record<string, unknown> = {};
      const failures: unknown[] = [];
      for (const u of updates) {
        if (u instanceof Error) failures.push(u);
        else if (typeof u === "function") exports[u.name] = u;
        else Object.assign(exports, u);
      }
      return applyUpdate([{ url: moduleUrl, exports }], failures, [mounted.scope, injector]);
    },
    dispatch: (target, name, event) => {
      for (const handler of [...(target.listeners[name] ?? [])]) handler(event);
    },
    fill: (target, value) => {
      const type = String(target.attrs.type ?? target.props.type ?? "text");
      const toggles = target.tag === "input" && (type === "checkbox" || type === "radio");
      if (typeof value === "boolean") target.props.checked = value;
      else target.props.value = value;
      fixture.dispatch(target, toggles || target.tag === "select" ? "change" : "input");
    },
    type: (target, text) => {
      target.props.value = text;
      fixture.dispatch(target, "input", eventFor(target, "input", { inputType: "insertText", data: text }));
    },
    change: (target, value) => {
      if (typeof value === "boolean") target.props.checked = value;
      else if (value !== undefined) target.props.value = value;
      fixture.dispatch(target, "change", eventFor(target, "change"));
    },
    keydown: (target, key, init) => {
      const code = key.length === 1 ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : /d/.test(key) ? `Digit${key}` : key === " " ? "Space" : key) : key;
      const modifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false };
      fixture.dispatch(target, "keydown", eventFor(target, "keydown", { key, code, ...modifiers, ...init }));
    },
    blur: (target) => fixture.dispatch(target, "blur"),
    destroy() {
      if (!destroyed) {
        destroyed = true;
        live.delete(fixture);
        try {
          const backend = injector.get(HttpBackend, { optional: true });
          if (backend instanceof HttpTestingBackend) backend.verify();
        } finally {
          mounted.destroy();
        }
      }
      const left = reports.splice(0);
      if (left.length === 1) throw left[0]!.error;
      if (left.length > 1) throw new AggregateError(left.map((r) => r.error), `${left.length} error reports were never expected (use errors.expect())`);
    },
    [Symbol.dispose]() {
      fixture.destroy();
    },
  };
  live.add(fixture);
  return fixture;
}
/**
 * Mounts one Scene of a `*.scenes.ts` file (its default export): the component with the scene's inputs, and the scene's
 * providers on top of the test injector. A scene's `http` mocks replace the recording HTTP backend (so `fixture.http` is not available for it). Extra `options.providers` go after the scene's, so a test can still override.
 */
export function mountScene<T extends object>(scenes: ComponentScenes<T>, name: string, options: Omit<MountOptions<T>, "inputs"> = {}): Fixture<T> {
  const scene = scenes.scenes[name];
  if (!scene) throw new Error(`No scene "${name}" for ${scenes.component.name}. Scenes: ${Object.keys(scenes.scenes).join(", ") || "(none)"}.`);
  const mocks = scene.http ? mockHttp(scene.http) : [];
  return mount(scenes.component, { ...options, inputs: scene.inputs, providers: [...mocks, ...(scene.providers ?? []), ...(options.providers ?? [])] });
}

export type { ComponentScenes, Scene } from "@gable/core/tooling";

export { createTestInjector } from "./injector.js";
export { HttpTestingBackend, TestRequest } from "./http.js";
export type { RequestMatch } from "./http.js";
export { httpTesting } from "./injector.js";

// --- mountApp ---------------------------------------------------------------

export interface MountAppOptions extends Omit<MountOptions, "renderer"> {
  routes: readonly Route[];
  /** The initial URL. Defaults to `/`. */
  url?: string;
  /** Defaults to a test renderer starting at `url`; its in-memory Location, History and Title are provided. */
  renderer?: TestRenderer;
  /** Router accessibility options (announcement and focus) passed to `provideRouter`. */
  a11y?: RouterAccessibilityOptions;
}

/** A mounted app with a router. */
export interface AppFixture<T extends object> extends Fixture<T> {
  readonly router: Router;
  /** Navigates, then resolves (with the outcome) after guards, lazy routes and the view update have finished. Never rejects. */
  navigate(target: string | readonly unknown[], options?: NavigateOptions): Promise<NavigationOutcome>;
  /** The in-memory Location: `url` is what a browser would show. */
  readonly location: TestPlatform["location"];
  /** The in-memory History: `entries`, `index`, and `back()` / `forward()` as the browser buttons. */
  readonly history: TestPlatform["history"];
  readonly title: TestPlatform["title"];
  /** The in-memory Meta: `entries` shows the tags the current route declared. */
  readonly meta: TestPlatform["meta"];
  /** The in-memory LiveAnnouncer: `messages` lists what was announced. */
  readonly announcer: TestPlatform["announcer"];
  /** The in-memory FocusManager: `focused` is the node focus moved to. */
  readonly focus: TestPlatform["focus"];
}

/**
 * `mount` for an app with routes: the Root component (with a `<router-outlet>`), a router, and an in-memory
 * Location, History and Title. `settle()` also waits for any navigation in flight, including the initial one.
 */
export function mountApp<T extends object>(Root: ComponentClass<T>, options: MountAppOptions): AppFixture<T> {
  const { routes, url, a11y, renderer = createTestRenderer({ url }), providers = [], ...rest } = options;
  const fixture = mount(Root, { ...rest, renderer, providers: [...renderer.providers!, ...provideRouter(routes, { a11y }), ...providers] });
  const router = fixture.injector.get(Router)!;
  const app: AppFixture<T> = Object.create(fixture, {
    router: { value: router },
    location: { value: renderer.platform.location },
    history: { value: renderer.platform.history },
    title: { value: renderer.platform.title },
    meta: { value: renderer.platform.meta },
    announcer: { value: renderer.platform.announcer },
    focus: { value: renderer.platform.focus },
    settle: {
      value: async () => {
        await router.whenIdle();
        await fixture.settle();
      },
    },
    navigate: {
      value: async (target: string | readonly unknown[], navigateOptions?: NavigateOptions) => {
        const outcome = await router.navigate(target, navigateOptions);
        await whenFlushed();
        return outcome;
      },
    },
  });
  return app;
}
