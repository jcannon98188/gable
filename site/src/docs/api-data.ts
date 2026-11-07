import { InjectionToken, inject, signal } from "@gable/core";
import type { ApiIndex, ApiPackage } from "./api-types.js";

/** Where the generated reference comes from. Tests provide a fixture; the app reads site/src/generated/api. */
export interface ApiSource {
  index(): Promise<ApiIndex>;
  /** The package, or null for an unknown slug. */
  pkg(slug: string): Promise<ApiPackage | null>;
}

type Loader<T> = () => Promise<T>;
// Lazy: one chunk per package. The directory may be empty (the extractor has not run): then the reference is "not generated".
const FILES = import.meta.glob("../generated/api/*.json", { import: "default" }) as Record<string, Loader<unknown>>;

const generated: ApiSource = {
  index: async () => {
    const load = Object.entries(FILES).find(([path]) => path.endsWith("/index.json"))?.[1];
    if (!load) throw new Error("The API reference has not been generated (run npm run api -w site).");
    return (await load()) as ApiIndex;
  },
  pkg: async (slug) => {
    const load = Object.entries(FILES).find(([path]) => path.endsWith(`/${slug}.json`))?.[1];
    return load ? ((await load()) as ApiPackage) : null;
  },
};

export const API_SOURCE = new InjectionToken<ApiSource>("API_SOURCE");

/** The reference data, loaded once per package and shared by the sidebar, the pages and the search. */
export class ApiData {
  static scope = "root";

  private source = inject(API_SOURCE, { optional: true }) ?? generated;
  private packages = new Map<string, Promise<ApiPackage | null>>();
  private indexPromise: Promise<ApiIndex | null> | undefined;

  /** The index, once loaded; null before that or when it could not be loaded. */
  index = signal<ApiIndex | null>(null);
  /** Set when the index failed to load. */
  failed = signal(false);

  loadIndex(): Promise<ApiIndex | null> {
    this.indexPromise ??= this.source.index().then(
      (index) => (this.index.set(index), index),
      () => (this.failed.set(true), null),
    );
    return this.indexPromise;
  }

  loadPackage(slug: string): Promise<ApiPackage | null> {
    let p = this.packages.get(slug);
    if (!p) {
      p = this.source.pkg(slug).catch(() => null);
      this.packages.set(slug, p);
    }
    return p;
  }

  /** Every package, for the search. */
  async loadAll(): Promise<ApiPackage[]> {
    const index = await this.loadIndex();
    const all = await Promise.all((index?.packages ?? []).map((p) => this.loadPackage(p.slug)));
    return all.filter((p): p is ApiPackage => !!p);
  }
}
