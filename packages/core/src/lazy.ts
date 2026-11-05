import type { ComponentClass } from "./component.js";

/** A `meta.imports` entry that loads a component on demand. Usable only inside `@defer`. */
export interface LazyEntry {
  readonly kind: "lazy";
  /** The export name of the component in the loaded module (also shown in errors). */
  readonly name: string;
  /** Loads the module once and returns the component; a failed load may be retried. */
  load(): Promise<ComponentClass<any>>;
  /** Loads the module once and returns the named export, whatever it is (the router uses it for lazy children). */
  loadExport(): Promise<unknown>;
}

/** `lazy(() => import('./chart.js'), 'Chart')`. */
export function lazy(loader: () => Promise<Record<string, unknown>>, name: string): LazyEntry {
  let loading: Promise<unknown> | null = null;
  const loadExport = (): Promise<unknown> =>
    (loading ??= loader().then((module) => {
      if (!(name in module)) throw new Error(`lazy(): the loaded module has no export "${name}".`);
      return module[name];
    })).catch((error) => {
      loading = null;
      throw error;
    });
  return {
    kind: "lazy",
    name,
    loadExport,
    load: () =>
      loadExport().then((Class) => {
        if (typeof Class !== "function") throw new Error(`lazy(): the loaded module has no component export "${name}".`);
        return Class as ComponentClass<any>;
      }),
  };
}

export function isLazy(entry: unknown): entry is LazyEntry {
  return typeof entry === "object" && entry !== null && (entry as LazyEntry).kind === "lazy";
}
