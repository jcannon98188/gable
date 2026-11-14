// The in-memory worker scope's registration: notifications the worker shows and background sync tags it registers.
import type {
  WorkerNotification,
  WorkerNotificationAction,
  WorkerNotificationOptions,
  WorkerRegistration,
  WorkerSyncManager,
} from "../core/index.js";

/** A notification the worker showed. */
export class InMemoryNotification implements WorkerNotification {
  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly data: unknown;
  /** The action buttons it was shown with. */
  readonly actions: readonly WorkerNotificationAction[];
  readonly #close: (notification: InMemoryNotification) => void;

  constructor(title: string, options: WorkerNotificationOptions, close: (notification: InMemoryNotification) => void) {
    this.title = title;
    this.body = options.body ?? "";
    this.tag = options.tag ?? "";
    // As in the browser, the data is structured-cloned when the notification is shown.
    this.data = options.data === undefined ? null : structuredClone(options.data);
    this.actions = options.actions ? options.actions.map((action) => ({ ...action })) : [];
    this.#close = close;
  }

  close(): void {
    this.#close(this);
  }
}

/** Background sync tags, kept until their sync succeeds or runs out of chances. */
export class InMemorySyncManager implements WorkerSyncManager {
  readonly #tags = new Set<string>();

  async register(tag: string): Promise<void> {
    this.#tags.add(tag);
  }

  async getTags(): Promise<string[]> {
    return [...this.#tags];
  }

  /** Whether `tag` is registered. */
  has(tag: string): boolean {
    return this.#tags.has(tag);
  }

  /** @internal Drops `tag` once its sync is over. */
  done(tag: string): void {
    this.#tags.delete(tag);
  }
}

/** Options for {@link InMemoryRegistration}. */
export interface InMemoryRegistrationOptions {
  /** Whether the browser has background sync. Defaults to `true`; `false` leaves `sync` undefined, as Firefox and Safari do. */
  backgroundSync?: boolean;
}

/** The in-memory scope's registration. */
export class InMemoryRegistration implements WorkerRegistration {
  readonly #shown: InMemoryNotification[] = [];
  /** Background sync, `undefined` when the scope was created with `backgroundSync: false`. */
  readonly sync: InMemorySyncManager | undefined;

  constructor(options: InMemoryRegistrationOptions = {}) {
    this.sync = options.backgroundSync === false ? undefined : new InMemorySyncManager();
  }

  /** Shows a notification once a timer task has passed, as a browser does it asynchronously. */
  async showNotification(title: string, options: WorkerNotificationOptions = {}): Promise<void> {
    const notification = new InMemoryNotification(title, options, (n) => this.#remove(n));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // A notification with the tag of an open one replaces it.
    if (notification.tag) {
      for (const open of this.#shown.filter((n) => n.tag === notification.tag)) this.#remove(open);
    }
    this.#shown.push(notification);
  }

  async getNotifications(filter: { tag?: string } = {}): Promise<readonly InMemoryNotification[]> {
    return this.#shown.filter((n) => filter.tag === undefined || n.tag === filter.tag);
  }

  #remove(notification: InMemoryNotification): void {
    const index = this.#shown.indexOf(notification);
    if (index >= 0) this.#shown.splice(index, 1);
  }
}
