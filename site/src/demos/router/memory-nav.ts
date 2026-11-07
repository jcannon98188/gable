import { computed, signal, untracked, type ReadonlySignal } from "@gable/core";
import { FocusManager, History, LiveAnnouncer, Location, Meta, Title } from "@gable/core/renderer";

interface Entry {
  href: string;
  state: unknown;
}

/**
 * An in-memory Location and History for the demo's own router. The page URL and `window.history` are never read or
 * written: the router asks this object where it is and tells it where it went. The entries are signals so the demo can
 * draw the history stack and the back and forward buttons from them.
 */
export class MemoryNav {
  #stack = signal<readonly Entry[]>([{ href: "/", state: null }]);
  #at = signal(0);
  #listeners = new Set<(href: string, state: unknown) => void>();

  entries = computed(() => this.#stack().map((e) => e.href));
  index: ReadonlySignal<number> = this.#at;
  canBack = computed(() => this.#at() > 0);
  canForward = computed(() => this.#at() < this.#stack().length - 1);

  #now(): Entry {
    return untracked(() => this.#stack()[this.#at()]!);
  }
  #part(which: "pathname" | "search" | "hash"): string {
    return new URL(this.#now().href, "http://gable.invalid")[which];
  }

  get href(): string {
    return this.#now().href;
  }
  get pathname(): string {
    return this.#part("pathname");
  }
  get search(): string {
    return this.#part("search");
  }
  get hash(): string {
    return this.#part("hash");
  }
  get state(): unknown {
    return this.#now().state;
  }

  subscribe(listener: (href: string, state: unknown) => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  push(href: string, state?: unknown): void {
    const at = untracked(this.#at);
    this.#stack.set([...untracked(this.#stack).slice(0, at + 1), { href, state: state ?? null }]);
    this.#at.set(at + 1);
  }
  replace(href: string, state?: unknown): void {
    const at = untracked(this.#at);
    this.#stack.set(untracked(this.#stack).map((e, i) => (i === at ? { href, state: state ?? null } : e)));
  }
  back(): void {
    this.#go(untracked(this.#at) - 1);
  }
  forward(): void {
    this.#go(untracked(this.#at) + 1);
  }
  #go(to: number): void {
    if (to < 0 || to >= untracked(this.#stack).length) return;
    this.#at.set(to);
    const entry = this.#now();
    for (const listener of [...this.#listeners]) listener(entry.href, entry.state);
  }
}

/**
 * Providers that make the Router use a MemoryNav. Title, Meta, LiveAnnouncer and FocusManager are provided as null so the
 * demo cannot reach the page's own (the router treats all four as optional).
 */
export const memoryPlatform = [
  MemoryNav,
  { provide: Location, useExisting: MemoryNav },
  { provide: History, useExisting: MemoryNav },
  { provide: Title, useValue: null },
  { provide: Meta, useValue: null },
  { provide: LiveAnnouncer, useValue: null },
  { provide: FocusManager, useValue: null },
];
