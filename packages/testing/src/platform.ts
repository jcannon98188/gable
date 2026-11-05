import { History, Location, Title } from "@gable/core/renderer";
import type { Provider } from "@gable/core";

/** In-memory Location, History and Title of the Test renderer: no window, no document. */
export interface TestPlatform {
  readonly location: Location & { readonly url: string };
  readonly history: History & { readonly entries: readonly string[]; readonly index: number };
  readonly title: Title;
  /** Providers for `Location`, `History` and `Title`. */
  readonly providers: Provider[];
}

function part(href: string, which: "pathname" | "search" | "hash"): string {
  return new URL(href, "http://gable.invalid")[which];
}

/** A fresh platform whose first history entry is `url`. */
export function createTestPlatform(url = "/"): TestPlatform {
  const entries: Array<{ href: string; state: unknown }> = [{ href: url, state: null }];
  let index = 0;
  let title = "";
  const listeners = new Set<(href: string, state: unknown) => void>();
  const go = (to: number) => {
    if (to < 0 || to >= entries.length) return;
    index = to;
    for (const listener of [...listeners]) listener(entries[index]!.href, entries[index]!.state);
  };
  const location = {
    get url() {
      return entries[index]!.href;
    },
    get href() {
      return entries[index]!.href;
    },
    get pathname() {
      return part(entries[index]!.href, "pathname");
    },
    get search() {
      return part(entries[index]!.href, "search");
    },
    get hash() {
      return part(entries[index]!.href, "hash");
    },
    subscribe(listener: (href: string, state: unknown) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const history = {
    get state() {
      return entries[index]!.state;
    },
    get entries() {
      return entries.map((e) => e.href);
    },
    get index() {
      return index;
    },
    push(href: string, state?: unknown) {
      entries.splice(index + 1, entries.length, { href, state: state ?? null });
      index++;
    },
    replace(href: string, state?: unknown) {
      entries[index] = { href, state: state ?? null };
    },
    back: () => go(index - 1),
    forward: () => go(index + 1),
  };
  const titleService = { get: () => title, set: (value: string) => void (title = value) };
  return {
    location,
    history,
    title: titleService,
    providers: [
      { provide: Location, useValue: location },
      { provide: History, useValue: history },
      { provide: Title, useValue: titleService },
    ],
  };
}
