/**
 * Platform services as abstract Tokens: the router and core depend on these, never on a platform.
 * A platform package (the DOM renderer, a native renderer, the Test renderer) provides implementations.
 * URLs are app-relative: a path with optional search and hash, with any base path or `#` prefix already removed.
 */

/** The current URL, and notification when it changes by means other than the app (back/forward, hash edits). */
export abstract class Location {
  /** Path, search and hash, e.g. `/users/4?tab=a#top`. */
  abstract readonly href: string;
  abstract readonly pathname: string;
  /** Including the leading `?`, or empty. */
  abstract readonly search: string;
  /** Including the leading `#`, or empty. */
  abstract readonly hash: string;
  /** Calls `listener` with the new `href` and the history state whenever the URL changes outside `History`. Returns an unsubscribe function. */
  abstract subscribe(listener: (href: string, state: unknown) => void): () => void;
}

/** Changes the current URL. */
export abstract class History {
  abstract readonly state: unknown;
  abstract push(href: string, state?: unknown): void;
  abstract replace(href: string, state?: unknown): void;
  abstract back(): void;
  abstract forward(): void;
}

/** The document title. */
export abstract class Title {
  abstract get(): string;
  abstract set(title: string): void;
}

/** Document metadata a route or component can declare. `og` and `twitter` keys omit the prefix: `{ og: { title: 'x' } }` is `og:title`. */
export interface MetaTags {
  description?: string;
  robots?: string;
  themeColor?: string;
  /** Written as `<link rel="canonical">`. */
  canonical?: string;
  /** Open Graph: `title` becomes `<meta property="og:title">`. */
  og?: Readonly<Record<string, string>>;
  /** Twitter card: `card` becomes `<meta name="twitter:card">`. */
  twitter?: Readonly<Record<string, string>>;
}

/** One concrete head entry of a `MetaTags`: a `<meta name>`, `<meta property>` or `<link rel>`. */
export interface MetaEntry {
  kind: "name" | "property" | "link";
  key: string;
  value: string;
}

/** Flattens tags to head entries. `undefined` values are skipped. Shared by every Meta implementation. */
export function metaEntries(tags: MetaTags): MetaEntry[] {
  const out: MetaEntry[] = [];
  const add = (kind: MetaEntry["kind"], key: string, value: string | undefined) => {
    if (value !== undefined) out.push({ kind, key, value });
  };
  add("name", "description", tags.description);
  add("name", "robots", tags.robots);
  add("name", "theme-color", tags.themeColor);
  add("link", "canonical", tags.canonical);
  for (const [k, v] of Object.entries(tags.og ?? {})) add("property", `og:${k}`, v);
  for (const [k, v] of Object.entries(tags.twitter ?? {})) add("name", `twitter:${k}`, v);
  return out;
}

/** Merges tag sets, later ones winning; `og` and `twitter` merge per key. */
export function mergeMeta(...sets: readonly (MetaTags | undefined)[]): MetaTags {
  const out: MetaTags = {};
  for (const s of sets) {
    if (!s) continue;
    const { og, twitter, ...rest } = s;
    Object.assign(out, rest);
    if (og) out.og = { ...out.og, ...og };
    if (twitter) out.twitter = { ...out.twitter, ...twitter };
  }
  return out;
}

/** Document meta tags and the canonical link. The router calls `set` on every navigation with the matched routes' merged `meta`. */
export abstract class Meta {
  /** The tags currently managed through this service. */
  abstract get(): MetaTags;
  /** Replaces everything managed: tags absent from `tags` are removed (or restored to the page's own). */
  abstract set(tags: MetaTags): void;
  /** Merges `tags` into the current set (`og` and `twitter` per key). */
  abstract update(tags: MetaTags): void;
  /** Same as `set({})`. */
  abstract clear(): void;
}

/**
 * How urgently a screen reader should speak an announcement: `polite` waits for the user to be idle and `assertive` interrupts. Used by `LiveAnnouncer.announce`.
 */
export type Politeness = "polite" | "assertive";

/**
 * Speaks a message to assistive technology through a live region the platform maintains: `polite` waits for the
 * screen reader to finish, `assertive` interrupts. The router uses it to announce each page; apps and components
 * (toasts, form errors) can inject it too. The DOM renderer keeps the regions in its overlay root (or `document.body`).
 */
export abstract class LiveAnnouncer {
  /** Announces `message`. Announcing the same text twice in a row is heard twice. Empty messages are ignored. */
  abstract announce(message: string, politeness?: Politeness): void;
  /** Empties both regions. */
  abstract clear(): void;
}

/** Where focus should go: one CSS selector, or several tried in order (the first that matches wins). */
export type FocusTarget = string | readonly string[];

/** Moves keyboard and screen reader focus. The router calls it after each navigation. */
export abstract class FocusManager {
  /** Focuses the first element matching `target`, making it programmatically focusable (`tabindex="-1"`) when it is not. Returns whether something was focused. */
  abstract focus(target: FocusTarget): boolean;
}
