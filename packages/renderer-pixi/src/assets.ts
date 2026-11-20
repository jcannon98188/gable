// The app-level Assets service (canvas/114): explicit loading through bundle handles over Pixi's global `Assets`.
// Templates never start a load; they read the handle's signals. Textures resolve from Pixi's cache (see renderer.ts).
import { InjectionToken, computed, inject, onCleanup, signal, type Provider, type ReadonlySignal } from "@gable/core";

/** A Pixi manifest entry list for one bundle: `{ alias, src }` entries (spritesheets, bitmap fonts and web fonts included). */
export type BundleEntries = ReadonlyArray<Record<string, unknown>> | Readonly<Record<string, unknown>>;

/**
 * What the service needs from the asset system. The default is Pixi's global `Assets`; tests and test doubles
 * (canvas/127) pass their own through {@link AssetsOptions.backend}.
 */
export interface AssetsBackend {
  addBundle(name: string, entries: BundleEntries): void;
  loadBundle(name: string, onProgress?: (progress: number) => void): Promise<unknown>;
  unloadBundle(name: string): Promise<unknown>;
}

/**
 * The default backend over Pixi's global `Assets`. Pixi is loaded by dynamic import on the first load or unload, so an app
 * that only provides the service never downloads it (canvas/122 #3). Bundles are recorded at once and registered with Pixi
 * just before their first load.
 */
function createPixiBackend(): AssetsBackend {
  const declared = new Map<string, BundleEntries>();
  const registered = new Set<string>();
  const pixi = () => import("pixi.js").then((m) => m.Assets);
  return {
    addBundle: (name, entries) => void declared.set(name, entries),
    async loadBundle(name, onProgress) {
      const assets = await pixi();
      if (!registered.has(name)) {
        registered.add(name);
        assets.addBundle(name, declared.get(name) as never);
      }
      return assets.loadBundle(name, onProgress);
    },
    async unloadBundle(name) {
      if (!registered.has(name)) return;
      return (await pixi()).unloadBundle(name);
    },
  };
}

export interface AssetsOptions {
  /** Bundles by name, as Pixi manifest entries. Import single files normally so Vite hashes their URLs. */
  bundles: Readonly<Record<string, BundleEntries>>;
  /** Replaces Pixi's `Assets` (tests). */
  backend?: AssetsBackend;
}

export const ASSETS_OPTIONS = new InjectionToken<AssetsOptions>("AssetsOptions");

/**
 * Installs the {@link Assets} service with its bundles. Put it in the app's root providers.
 *
 * @example
 * ```ts
 * import shipUrl from "./ship.png";
 * bootstrap(Root, { renderer: dom(), providers: provideAssets({ bundles: { level1: [{ alias: "ship", src: shipUrl }] } }) });
 * ```
 */
export function provideAssets(options: AssetsOptions): Provider[] {
  return [{ provide: ASSETS_OPTIONS, useValue: options }];
}

export type BundleStatus = "idle" | "loading" | "ready" | "error";

export interface LoadOptions {
  /** App-lifetime assets: this load is not released when the calling scope is disposed. */
  keepAlive?: boolean;
}

/** One bundle's state and controls. Reads are signals, so templates and effects follow them. */
export interface BundleHandle {
  readonly name: string;
  readonly status: ReadonlySignal<BundleStatus>;
  /** 0 to 1 while loading. */
  readonly progress: ReadonlySignal<number>;
  /** The load failure, or null. Asset failures surface here, not in `@error` (which reports lazy imports). */
  readonly error: ReadonlySignal<unknown>;
  /** `status() === "ready"`, for `@if (level.ready())`. */
  readonly ready: ReadonlySignal<boolean>;
  /**
   * Starts loading, or joins the load in flight, or resolves at once when ready: idempotent. Inside a component or
   * block the load is counted against that scope and released when it is disposed; at zero the bundle unloads
   * (unless `keepAlive`). Outside any scope the load is never released automatically.
   */
  load(options?: LoadOptions): Promise<void>;
  /** Unloads now, whatever the count, and returns to `idle`. Later scope disposals of earlier loads are no-ops. */
  unload(): Promise<void>;
}

export class Assets {
  static scope = "root";

  readonly #options = inject(ASSETS_OPTIONS, { optional: true }) ?? { bundles: {} };
  readonly #backend: AssetsBackend = this.#options.backend ?? createPixiBackend();
  readonly #handles = new Map<string, BundleHandle>();

  /** The handle for a bundle declared in `provideAssets`. The same handle is returned for the same name. */
  bundle(name: string): BundleHandle {
    let handle = this.#handles.get(name);
    if (!handle) {
      const entries = Object.prototype.hasOwnProperty.call(this.#options.bundles, name) ? this.#options.bundles[name] : undefined;
      if (!entries) {
        throw new Error(`Unknown bundle "${name}" in the Assets service. Declared bundles: ${Object.keys(this.#options.bundles).join(", ") || "(none)"}. Declare it in provideAssets({ bundles }).`);
      }
      this.#backend.addBundle(name, entries);
      handle = createHandle(name, this.#backend);
      this.#handles.set(name, handle);
    }
    return handle;
  }
}

function createHandle(name: string, backend: AssetsBackend): BundleHandle {
  const status = signal<BundleStatus>("idle");
  const progress = signal(0);
  const error = signal<unknown>(null);
  let promise: Promise<void> | null = null;
  /** Bumped by unload(): releases and loads from an older generation are ignored. */
  let generation = 0;
  let count = 0;

  const release = (gen: number) => {
    if (gen !== generation) return;
    count--;
    if (count > 0) return;
    // At zero: unload now, or once the in-flight load settles.
    const pending = promise;
    void (pending ? pending.catch(() => {}) : Promise.resolve()).then(() => {
      if (gen === generation && count <= 0 && status() !== "idle") void handle.unload();
    });
  };

  const handle: BundleHandle = {
    name,
    status,
    progress,
    error,
    ready: computed(() => status() === "ready"),
    load(options = {}) {
      const gen = generation;
      if (!options.keepAlive) {
        try {
          onCleanup(() => release(gen));
          count++;
        } catch {
          // Outside any scope: never auto-released.
          count++;
        }
      } else count++;
      if (promise) return promise;
      status.set("loading");
      progress.set(0);
      error.set(null);
      const run: Promise<void> = backend
        .loadBundle(name, (p) => {
          if (promise === run) progress.set(p);
        })
        .then(
          () => {
            if (promise !== run) return;
            progress.set(1);
            status.set("ready");
          },
          (e: unknown) => {
            if (promise === run) {
              promise = null;
              error.set(e);
              status.set("error");
            }
            throw e;
          },
        );
      promise = run;
      return run;
    },
    async unload() {
      if (status() === "idle") return;
      generation++;
      count = 0;
      const pending = promise;
      promise = null;
      status.set("idle");
      progress.set(0);
      error.set(null);
      await pending?.catch(() => {});
      await backend.unloadBundle(name);
    },
  };
  return handle;
}
