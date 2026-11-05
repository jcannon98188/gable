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
