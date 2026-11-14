// Typed background sync (ADR 0021): one handle per tag that registers the sync and handles its sync events. A failed
// attempt fails the sync event so the browser retries it later; only a failed last chance is reported to the app,
// as a runtime error, since earlier failures are what background sync exists to absorb.
import { createAppChannel } from "./messages.js";
import type { WorkerScope, WorkerSyncEvent } from "./scope.js";

/** What a sync handler is told. */
export interface SyncContext<Tag extends string = string> {
  /** The worker's version, as passed to {@link backgroundSync}. */
  readonly version: string;
  /** The tag being synced. */
  readonly tag: Tag;
  /** Whether the browser gives up on the tag if this attempt fails. */
  readonly lastChance: boolean;
  /** The sync event itself. */
  readonly event: WorkerSyncEvent;
}

/**
 * Does the work a sync was registered for, such as sending queued requests. A returned promise keeps the sync event,
 * and the worker, alive until it settles; a rejection, or a throw, fails this attempt and the browser retries later.
 */
export type SyncHandler<Tag extends string = string> = (context: SyncContext<Tag>) => void | Promise<unknown>;

/** Options for {@link backgroundSync}. */
export interface BackgroundSyncOptions<Tag extends string> {
  /** The tag the sync is registered under. One handle per tag. */
  readonly tag: Tag;
  /** The worker's version, sent to the app when a last chance fails. */
  readonly version: string;
  /** Runs for each sync event with {@link tag}. */
  readonly sync: SyncHandler<Tag>;
}

/** A background sync for one tag. Create one with {@link backgroundSync}. */
export interface BackgroundSync<Tag extends string = string> {
  /** The tag the sync is registered under. */
  readonly tag: Tag;
  /** Whether the browser has background sync. Without it {@link register} does nothing and the handler never runs. */
  readonly supported: boolean;
  /**
   * Asks the browser for a sync event with the tag once the device is online. Resolves `true` once registered, or
   * `false` in a browser without background sync, where the caller has to retry by other means (on the next start
   * of the worker, say). Registering a pending tag again does nothing.
   */
  register(): Promise<boolean>;
  /** Whether the tag is registered and not yet synced. */
  isRegistered(): Promise<boolean>;
  /** Stops handling the tag's sync events. A registered tag stays registered. */
  dispose(): void;
}

/**
 * Creates a background sync for `options.tag`: {@link BackgroundSync.register} registers it and `options.sync` runs
 * for its sync events (other tags are left to other listeners). The browser retries a failed attempt later; when
 * its last chance fails too, the failure is reported to the app's pages as a `runtime` error.
 *
 * @example
 * ```ts
 * const outbox = backgroundSync(self, { tag: "outbox", version, sync: () => sendQueuedMessages() });
 * // after a send fails offline:
 * await outbox.register();
 * ```
 */
export function backgroundSync<Tag extends string>(self: WorkerScope, options: BackgroundSyncOptions<Tag>): BackgroundSync<Tag> {
  const { tag, version, sync } = options;
  const channel = createAppChannel(self);
  const listener = (event: WorkerSyncEvent) => {
    if (event.tag !== tag) return;
    const { lastChance } = event;
    event.waitUntil(
      (async () => {
        try {
          await sync({ version, tag, lastChance, event });
        } catch (error) {
          if (lastChance) await channel.reportError(version, "runtime", error);
          throw error;
        }
      })(),
    );
  };
  self.addEventListener("sync", listener);
  return {
    tag,
    get supported() {
      return self.registration.sync !== undefined;
    },
    async register() {
      const manager = self.registration.sync;
      if (!manager) return false;
      await manager.register(tag);
      return true;
    },
    async isRegistered() {
      const manager = self.registration.sync;
      return manager ? (await manager.getTags()).includes(tag) : false;
    },
    dispose: () => self.removeEventListener("sync", listener),
  };
}
