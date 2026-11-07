import { computed, signal, untracked, type ReadonlySignal, type WritableSignal } from "./signals.js";
import type { Scope } from "./scope.js";
import type { Type } from "./di.js";

/** One thing a query can find: a component/directive instance on an element, or a `#ref`ed element. */
export interface QueryEntry {
  /** Set for a component or directive instance; undefined for a plain element entry. */
  instance?: object;
  node: unknown;
  refs: string[];
}

interface Query {
  match(entry: QueryEntry): boolean;
  entries: WritableSignal<QueryEntry[]>;
}

/** The queries one component declares: over its own template, and over content projected into it. */
export interface QueryHost {
  view: Query[];
  content: Query[];
}

export function createQueryHost(): QueryHost {
  return { view: [], content: [] };
}

let declaring: QueryHost | null = null;
let contentTarget: QueryHost | null = null;

/** Runs a component's field initialisers so query factories can register with it. */
export function declareQueries<T>(host: QueryHost, fn: () => T): T {
  const previous = declaring;
  declaring = host;
  try {
    return fn();
  } finally {
    declaring = previous;
  }
}

/** Runs `fn` so that components built inside count as content of `host` (or of nothing). */
export function withContentTarget<T>(host: QueryHost | null, fn: () => T): T {
  const previous = contentTarget;
  contentTarget = host;
  try {
    return fn();
  } finally {
    contentTarget = previous;
  }
}

/** Captures the current content target; the returned wrapper re-establishes it for later builds (control flow re-rendering after the first pass). */
export function keepContentTarget(): <T>(fn: () => T) => T {
  const host = contentTarget;
  return (fn) => withContentTarget(host, fn);
}

/** Offers a freshly built entry to the owner's view queries and to the enclosing content queries. Removes it when `scope` ends. */
export function registerEntry(
  owner: QueryHost | undefined,
  entry: QueryEntry,
  scope: Scope | null,
  compare?: (a: unknown, b: unknown) => number,
): void {
  const queries = [...(owner?.view ?? []), ...(contentTarget?.content ?? [])];
  for (const q of queries) {
    if (!q.match(entry)) continue;
    untracked(() => q.entries.update((list) => insertInOrder(list, entry, compare)));
    scope?.onDispose(() => untracked(() => q.entries.update((list) => list.filter((e) => e !== entry))));
  }
}

/** Inserts before the first entry that follows `entry` in the document; appends when order is unknown. */
function insertInOrder(list: QueryEntry[], entry: QueryEntry, compare?: (a: unknown, b: unknown) => number): QueryEntry[] {
  const at = compare ? list.findIndex((other) => compare(entry.node, other.node) < 0) : -1;
  return at < 0 ? [...list, entry] : [...list.slice(0, at), entry, ...list.slice(at)];
}

type Target<T> = Type<T> | string;

function declare<T>(kind: keyof QueryHost, what: string, target: Target<T>): ReadonlySignal<QueryEntry[]> {
  if (!declaring) throw new Error(`${what}() must be called in a field initialiser of a component.`);
  const match =
    typeof target === "string"
      ? (e: QueryEntry) => e.instance === undefined && e.refs.includes(target)
      : (e: QueryEntry) => e.instance instanceof (target as abstract new () => object);
  const query: Query = { match, entries: signal<QueryEntry[]>([]) };
  declaring[kind].push(query);
  return query.entries;
}

const valueOf = (e: QueryEntry) => e.instance ?? e.node;

function single(kind: keyof QueryHost, what: string) {
  function query<T>(target: Type<T>): ReadonlySignal<T | undefined>;
  function query<N = unknown>(ref: string): ReadonlySignal<N | undefined>;
  function query(target: Target<unknown>): ReadonlySignal<unknown> {
    const entries = declare(kind, what, target);
    return computed(() => {
      const first = entries()[0];
      return first && valueOf(first);
    });
  }
  query.required = function required<T>(target: Type<T> | string): ReadonlySignal<T> {
    const entries = declare(kind, `${what}.required`, target);
    return computed(() => {
      const first = entries()[0];
      if (!first) throw new Error(`Required query ${what}(${typeof target === "string" ? `"${target}"` : target.name}) found nothing.`);
      return valueOf(first) as T;
    });
  };
  return query;
}

function many(kind: keyof QueryHost, what: string) {
  function query<T>(target: Type<T>): ReadonlySignal<T[]>;
  function query<N = unknown>(ref: string): ReadonlySignal<N[]>;
  function query(target: Target<unknown>): ReadonlySignal<unknown[]> {
    const entries = declare(kind, what, target);
    return computed(() => entries().map(valueOf));
  }
  return query;
}

/**
 * First match in the component's own template, as a signal. By component class or `#ref` name.
 *
 * @example
 * ```ts
 * export class Form {
 *   static meta = {
 *     selector: "app-form",
 *     template: html`<input #name /><button (click)="focusName()">Focus</button>`,
 *   };
 *
 *   name = viewChild<HTMLInputElement>("name");
 *
 *   focusName() {
 *     this.name()?.focus();
 *   }
 * }
 * ```
 */
export const viewChild = single("view", "viewChild");
/** Every match in the component's own template, in creation order. */
export const viewChildren = many("view", "viewChildren");
/** First match among the content projected into this component. */
export const contentChild = single("content", "contentChild");
/**
 * Every match among the content projected into this component.
 *
 * @example
 * ```ts
 * export class Tab {
 *   static meta = { selector: "app-tab", template: html`<slot></slot>` };
 *   title = input("");
 * }
 *
 * export class Tabs {
 *   static meta = {
 *     selector: "app-tabs",
 *     template: html`<p>{{ tabs().length }} tabs</p><slot></slot>`,
 *   };
 *
 *   tabs = contentChildren(Tab);
 * }
 * ```
 */
export const contentChildren = many("content", "contentChildren");
