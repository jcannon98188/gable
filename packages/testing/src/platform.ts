import { FocusManager, History, Location, LiveAnnouncer, Meta, Title, mergeMeta, metaEntries, type FocusTarget, type MetaTags, type Politeness } from "@gable/core/renderer";
import type { TestNode } from "./renderer.js";
import type { Provider } from "@gable/core";

/** In-memory Location, History and Title of the Test renderer: no window, no document. */
export interface TestPlatform {
  readonly location: Location & { readonly url: string };
  readonly history: History & { readonly entries: readonly string[]; readonly index: number };
  readonly title: Title;
  /** In-memory Meta; `entries` lists the head entries as a browser would hold them. */
  readonly meta: Meta & { readonly entries: ReturnType<typeof metaEntries> };
  /** In-memory LiveAnnouncer: `messages` is every announcement in order, `polite` and `assertive` the current text of each region. */
  readonly announcer: LiveAnnouncer & {
    readonly messages: readonly { message: string; politeness: Politeness }[];
    readonly polite: string;
    readonly assertive: string;
  };
  /** In-memory FocusManager: `focused` is the node that has focus (found in the mounted tree), `requests` every target asked for. */
  readonly focus: FocusManager & { readonly focused: TestNode | null; readonly requests: readonly FocusTarget[] };
  /** Connects focus lookup to the mounted tree. The test renderer does this. */
  bindTree(tree: { root(): TestNode | undefined; find(root: TestNode, selector: string): TestNode | null }): void;
  /** Providers for `Location`, `History`, `Title`, `Meta`, `LiveAnnouncer` and `FocusManager`. */
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
  let tags: MetaTags = {};
  const metaService = {
    get: () => tags,
    get entries() {
      return metaEntries(tags);
    },
    set(next: MetaTags) {
      tags = next;
    },
    update(next: MetaTags) {
      tags = mergeMeta(tags, next);
    },
    clear() {
      tags = {};
    },
  };
  const messages: Array<{ message: string; politeness: Politeness }> = [];
  const regions = { polite: "", assertive: "" };
  const announcerService = {
    get messages() {
      return messages;
    },
    get polite() {
      return regions.polite;
    },
    get assertive() {
      return regions.assertive;
    },
    announce(message: string, politeness: Politeness = "polite") {
      if (!message) return;
      messages.push({ message, politeness });
      regions[politeness] = message;
    },
    clear() {
      regions.polite = regions.assertive = "";
    },
  };
  let tree: Parameters<TestPlatform["bindTree"]>[0] | undefined;
  let focused: TestNode | null = null;
  const requests: FocusTarget[] = [];
  const focusService = {
    get focused() {
      return focused;
    },
    get requests() {
      return requests;
    },
    focus(target: FocusTarget) {
      requests.push(target);
      const root = tree?.root();
      if (!root || !tree) return false;
      for (const selector of typeof target === "string" ? [target] : target) {
        const node = tree.find(root, selector);
        if (!node) continue;
        const natural = node.tag !== undefined && /^(button|input|select|textarea|summary)$/.test(node.tag);
        if (!natural && node.attrs.tabindex === undefined && !(node.tag === "a" && node.attrs.href !== undefined)) node.attrs.tabindex = "-1";
        focused = node;
        return true;
      }
      return false;
    },
  };
  return {
    location,
    history,
    title: titleService,
    meta: metaService,
    announcer: announcerService,
    focus: focusService,
    bindTree(next) {
      tree = next;
    },
    providers: [
      { provide: Location, useValue: location },
      { provide: History, useValue: history },
      { provide: Title, useValue: titleService },
      { provide: Meta, useValue: metaService },
      { provide: LiveAnnouncer, useValue: announcerService },
      { provide: FocusManager, useValue: focusService },
    ],
  };
}
