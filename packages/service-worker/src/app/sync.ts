// Background sync for the app (ADR 0021): registers the sync tags the worker handles. Only Chromium-based browsers
// have Background Sync, so every call has a defined outcome without it, and none of them throws.
import { inject } from "@gable/core";
import { whenActive } from "./active.js";
import type { SyncManagerLike } from "./container.js";
import { SwRegistration } from "./registration.js";

/**
 * Background sync for the app: asks the browser to run the worker's sync handler for a tag once the device is
 * online, for work that failed offline, such as sending queued messages. Injecting it registers the worker (through
 * {@link SwRegistration}), in production builds only; in development there is no worker, so it is unsupported.
 *
 * The worker handles the tag: `defineWorker({ sync: { outbox: () => sendQueuedMessages() } })` in the default worker,
 * or core's `backgroundSync()` in a custom one. A browser without Background Sync (Firefox, Safari) never runs
 * those handlers, so {@link SwSync.register} resolves `false` there and the app has to retry by other means, such as
 * sending the queue again when the page loads or the `online` event fires.
 *
 * @example
 * ```ts
 * const sync = inject(SwSync);
 *
 * async function send(message: Message) {
 *   try {
 *     await post(message);
 *   } catch {
 *     await queue(message);
 *     if (!(await sync.register("outbox"))) retryWhenOnline(); // no Background Sync here
 *   }
 * }
 * ```
 */
export class SwSync {
  static scope = "root";

  readonly #sw = inject(SwRegistration);

  /**
   * Whether the browser can run background syncs for this app: it has service workers and Background Sync, and the
   * worker is registered. Resolves `false` in development, where there is no worker, and when registering failed.
   */
  async isSupported(): Promise<boolean> {
    return (await this.#sw.ready)?.sync !== undefined;
  }

  /**
   * Asks the browser for a sync event with `tag` once the device is online, which runs the worker's handler for the
   * tag. Resolves `true` once the browser has the tag, after waiting for the worker to be active; registering a
   * tag that is still pending again is `true` and leaves one registration. Resolves `false`, and never throws, when
   * {@link SwSync.isSupported} is `false` and when the browser refuses the registration.
   */
  async register(tag: string): Promise<boolean> {
    const registration = await this.#sw.ready;
    const manager = registration?.sync;
    if (!registration || !manager) return false;
    await whenActive(registration);
    try {
      await manager.register(tag);
      return true;
    } catch {
      return false;
    }
  }

  /** The tags registered and not yet synced, or none where Background Sync is unsupported. */
  async getTags(): Promise<string[]> {
    const manager: SyncManagerLike | undefined = (await this.#sw.ready)?.sync;
    if (!manager) return [];
    try {
      return await manager.getTags();
    } catch {
      return [];
    }
  }
}
