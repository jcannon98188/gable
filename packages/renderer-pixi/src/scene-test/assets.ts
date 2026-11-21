// provideTestAssets (canvas/127): replaces the asset system under the real Assets service, so bundle handles, scope
// release counting and `@if (bundle.ready())` run exactly as in production. Bundles are ready at once by default with
// stub textures; a test can hold a load, report progress, finish it or fail it, and assert that a bundle was released.
import type { Provider } from "@gable/core";
import { ASSETS_OPTIONS, type AssetsBackend, type BundleEntries } from "../assets.js";
import type { StubTexture } from "./node.js";
import type { StubTextures } from "./renderer.js";

/** Options of `provideTestAssets`: the bundles the app declares and the texture registry to fill. */
export interface TestAssetsOptions {
  /** The bundles the app declares: names with their manifest entries (as `provideAssets`), or just names. */
  bundles: Readonly<Record<string, BundleEntries>> | readonly string[];
  /** The texture registry to fill, usually `scene.textures`. Default: a registry of its own (`assets.textures`). */
  textures?: StubTextures;
}

/** Scripts and inspects one bundle. */
export interface BundleScript {
  readonly name: string;
  /** `loading`: later loads stay pending (and report `progress` to the handle, 0 to 1); `ready`: finishes the pending load and lets later ones resolve at once. */
  setStatus(status: "loading" | "ready", progress?: number): void;
  /** Rejects the pending load with `error`, or, when none is pending, the next load. */
  fail(error: unknown): void;
  /** Times the bundle was loaded and unloaded through the backend. */
  readonly loads: number;
  readonly unloads: number;
  readonly isLoaded: boolean;
  /** Throws unless the bundle is loaded now. */
  expectLoaded(): void;
  /** Throws if the bundle is still loaded, or was never loaded. Await a flush first: release follows scope disposal asynchronously. */
  expectReleased(): void;
}

/** The Assets double `provideTestAssets` returns: the providers to install, the stub texture registry, and per-bundle scripts to hold, fail or inspect loads. */
export interface TestAssets {
  /** Put these in the app's root providers (or `mountWithScene({ assets })`). */
  readonly providers: Provider[];
  readonly textures: StubTextures;
  bundle(name: string): BundleScript;
  /** Sets the size the stub texture of `alias` gets when its bundle loads (default 1 by 1). Applies at once if already loaded. */
  stubTexture(alias: string, size: { width?: number; height?: number }): void;
}

interface BundleState {
  aliases: string[];
  held: boolean;
  heldProgress: number | undefined;
  failure: { error: unknown } | null;
  pending: { resolve(): void; reject(error: unknown): void; progress(p: number): void } | null;
  loaded: boolean;
  loads: number;
  unloads: number;
}

function aliasesOf(entries: BundleEntries): string[] {
  if (Array.isArray(entries)) {
    return (entries as ReadonlyArray<Record<string, unknown>>).flatMap((e) => {
      const alias = e.alias;
      return Array.isArray(alias) ? (alias as string[]) : typeof alias === "string" ? [alias] : [];
    });
  }
  return Object.keys(entries);
}

/** Replaces the asset system under the real Assets service with a scriptable double, so bundle handles and scope release behave as in production. Bundles are ready at once with stub textures unless a test holds or fails them. */
export function provideTestAssets(options: TestAssetsOptions): TestAssets {
  const textures: StubTextures = options.textures ?? new Map();
  const declared: Record<string, BundleEntries> = Array.isArray(options.bundles)
    ? Object.fromEntries((options.bundles as readonly string[]).map((n) => [n, []]))
    : { ...(options.bundles as Record<string, BundleEntries>) };
  const states = new Map<string, BundleState>();
  const sizes = new Map<string, { width?: number; height?: number }>();

  const stateOf = (name: string): BundleState => {
    let state = states.get(name);
    if (!state) {
      if (!Object.prototype.hasOwnProperty.call(declared, name)) {
        throw new Error(`Unknown bundle "${name}" in provideTestAssets. Declared bundles: ${Object.keys(declared).join(", ") || "(none)"}.`);
      }
      state = { aliases: aliasesOf(declared[name]!), held: false, heldProgress: undefined, failure: null, pending: null, loaded: false, loads: 0, unloads: 0 };
      states.set(name, state);
    }
    return state;
  };

  const register = (state: BundleState) => {
    state.loaded = true;
    state.loads++;
    for (const alias of state.aliases) {
      const size = sizes.get(alias);
      textures.set(alias, { alias, width: size?.width ?? 1, height: size?.height ?? 1 });
    }
  };

  const backend: AssetsBackend = {
    addBundle() {},
    loadBundle(name, onProgress) {
      const state = stateOf(name);
      if (state.failure) {
        const { error } = state.failure;
        state.failure = null;
        return Promise.reject(error);
      }
      if (state.held) {
        return new Promise<void>((resolve, reject) => {
          const progress = onProgress ?? (() => {});
          state.pending = { resolve, reject, progress };
          // The handle is not ready for progress until loadBundle has returned.
          if (state.heldProgress !== undefined) queueMicrotask(() => progress(state.heldProgress!));
        });
      }
      return Promise.resolve().then(() => {
        onProgress?.(1);
        register(state);
      });
    },
    unloadBundle(name) {
      const state = stateOf(name);
      state.loaded = false;
      state.unloads++;
      for (const alias of state.aliases) textures.delete(alias);
      return Promise.resolve();
    },
  };

  const scripts = new Map<string, BundleScript>();
  const bundle = (name: string): BundleScript => {
    let script = scripts.get(name);
    if (!script) {
      const state = stateOf(name);
      script = {
        name,
        setStatus(status, progress) {
          if (status === "loading") {
            state.held = true;
            if (progress !== undefined) {
              state.heldProgress = progress;
              state.pending?.progress(progress);
            }
            return;
          }
          state.held = false;
          state.heldProgress = undefined;
          const pending = state.pending;
          state.pending = null;
          if (pending) {
            register(state);
            pending.resolve();
          }
        },
        fail(error) {
          state.held = false;
          const pending = state.pending;
          state.pending = null;
          if (pending) pending.reject(error);
          else state.failure = { error };
        },
        get loads() {
          return state.loads;
        },
        get unloads() {
          return state.unloads;
        },
        get isLoaded() {
          return state.loaded;
        },
        expectLoaded() {
          if (!state.loaded) throw new Error(`Bundle "${name}" is not loaded (loaded ${state.loads} times, unloaded ${state.unloads}).`);
        },
        expectReleased() {
          if (state.loaded) throw new Error(`Bundle "${name}" is still loaded: the scope that loaded it was not disposed, or another load holds it.`);
          if (state.loads === 0) throw new Error(`Bundle "${name}" was never loaded, so there is nothing to release.`);
        },
      };
      scripts.set(name, script);
    }
    return script;
  };

  return {
    providers: [{ provide: ASSETS_OPTIONS, useValue: { bundles: declared, backend } } as Provider],
    textures,
    bundle,
    stubTexture(alias, size) {
      sizes.set(alias, { ...sizes.get(alias), ...size });
      const existing: StubTexture | undefined = textures.get(alias);
      if (existing) textures.set(alias, { ...existing, ...size });
    },
  };
}
