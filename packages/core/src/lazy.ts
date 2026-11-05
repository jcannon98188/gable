import type { ComponentClass } from "./component.js";

/** A `meta.imports` entry that loads a component on demand. Usable only inside `@defer`. */
export interface LazyEntry {
  readonly kind: "lazy";
  /** The export name of the component in the loaded module (also shown in errors). */
  readonly name: string;
  /** Loads the module once and returns the component; a failed load may be retried. */
  load(): Promise<ComponentClass<any>>;
}

/** `lazy(() => import('./chart.js'), 'Chart')`. */
export function lazy(loader: () => Promise<Record<string, unknown>>, name: string): LazyEntry {
  let loading: Promise<ComponentClass<any>> | null = null;
  return {
    kind: "lazy",
    name,
    load() {
      return (loading ??= loader().then((module) => {
        const Class = module[name];
        if (typeof Class !== "function") throw new Error(`lazy(): the loaded module has no component export "${name}".`);
        return Class as ComponentClass<any>;
      })).catch((error) => {
        loading = null;
        throw error;
      });
    },
  };
}

export function isLazy(entry: unknown): entry is LazyEntry {
  return typeof entry === "object" && entry !== null && (entry as LazyEntry).kind === "lazy";
}
