// Push for the app (ADR 0021): the push messages and notification clicks the worker forwards to open pages, as
// Observables, and the push subscription helper (permission, subscribe, getSubscription, unsubscribe).
import { inject, signal, type ReadonlySignal } from "@gable/core";
import { filter, map, type Observable } from "rxjs";
import type { NotificationClickMessage, NotificationInfo, PushMessage, WorkerToAppMessage } from "../core/messages.js";
import type { PushSubscriptionLike, ServiceWorkerRegistrationLike } from "./container.js";
import { SERVICE_WORKER_NOTIFICATIONS, SwRegistration } from "./registration.js";

/** A click on a notification the worker showed. */
export interface NotificationClick {
  /** The action button that was clicked, or `""` for a click on the notification itself. */
  readonly action: string;
  /** The notification that was clicked. */
  readonly notification: NotificationInfo;
}

/**
 * The notification permission, which push needs: `"default"` (the user was not asked, or dismissed the prompt),
 * `"granted"`, `"denied"`, or `"unsupported"` where the browser has no notifications.
 */
export type PushPermission = "default" | "granted" | "denied" | "unsupported";

/** Options for {@link SwPush.subscribe}. */
export interface PushSubscribeOptions {
  /** The server's VAPID public key, as a base64url string or its bytes. */
  readonly applicationServerKey: BufferSource | string;
  /** Whether every push shows a notification. Defaults to `true`, the only value Chromium-based browsers accept. */
  readonly userVisibleOnly?: boolean;
}

/**
 * What {@link SwPush.subscribe} ended with. Nothing in it is thrown:
 *
 * - `"subscribed"`: the push subscription, whose `toJSON()` is what the app sends to its server.
 * - `"unsupported"`: the browser has no service workers, notifications or push.
 * - `"unavailable"`: there is no registered worker, as in development or after registering failed.
 * - `"denied"`: the notification permission is denied, now or in the prompt. The app cannot ask again; the user has
 *   to change it in the browser's settings.
 * - `"dismissed"`: the user closed the permission prompt without answering. The app may ask again.
 * - `"failed"`: the browser could not subscribe, with its `error`: the push service was unreachable, the key was
 *   invalid, or the key differs from the one an existing subscription used (unsubscribe first).
 */
export type PushSubscribeResult =
  | { readonly status: "subscribed"; readonly subscription: PushSubscriptionLike }
  | { readonly status: "unsupported" }
  | { readonly status: "unavailable" }
  | { readonly status: "denied" }
  | { readonly status: "dismissed" }
  | { readonly status: "failed"; readonly error: unknown };

const toPermission = (value: string | undefined): PushPermission =>
  value === undefined ? "unsupported" : value === "granted" || value === "denied" ? value : "default";

/**
 * Push for the app: the push messages and notification clicks the worker forwards to open pages, as Observables, and
 * the push subscription helper. Injecting it registers the worker (through {@link SwRegistration}), in production
 * builds only; nothing is emitted in development, and subscribing reports `"unavailable"`.
 *
 * {@link SwPush.subscribe} asks for the notification permission and returns the push subscription to send to the
 * app's server; {@link SwPush.getSubscription} and {@link SwPush.unsubscribe} look it up and cancel it, and
 * {@link SwPush.permission} is the permission as a signal. Unsupported browsers and a denied permission are
 * outcomes of those calls, never exceptions.
 *
 * @example
 * ```ts
 * export class Inbox {
 *   static meta = { selector: "app-inbox", template: html`...` };
 *
 *   push = inject(SwPush);
 *   latest = toSignal(this.push.messages);
 *
 *   async enable() {
 *     const result = await this.push.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY });
 *     if (result.status === "subscribed") await sendToServer(result.subscription.toJSON());
 *   }
 * }
 * ```
 */
export class SwPush {
  static scope = "root";

  readonly #sw = inject(SwRegistration);
  readonly #notifications = inject(SERVICE_WORKER_NOTIFICATIONS, { optional: true });
  readonly #permission = signal<PushPermission>(toPermission(this.#notifications?.permission));

  /** The payload of each push message the worker receives: parsed JSON, text, or `null` for a push without one. */
  readonly messages: Observable<unknown> = this.#sw.messages.pipe(
    filter((message: WorkerToAppMessage): message is PushMessage => message.type === "push"),
    map((message) => message.data),
  );

  /** Each click on a notification the worker showed. */
  readonly notificationClicks: Observable<NotificationClick> = this.#sw.messages.pipe(
    filter((message: WorkerToAppMessage): message is NotificationClickMessage => message.type === "notification-click"),
    map(({ action, notification }) => ({ action, notification })),
  );

  /**
   * The notification permission. It is read when the service is created and again by every call that can change it
   * ({@link SwPush.subscribe}, {@link SwPush.requestPermission}, {@link SwPush.getSubscription}); a change the user
   * makes in the browser's settings shows up on the next of those calls.
   */
  readonly permission: ReadonlySignal<PushPermission> = this.#permission;

  /**
   * Asks the user for the notification permission, unless they already answered, and resolves with it. A browser
   * without notifications resolves `"unsupported"`. {@link SwPush.subscribe} does this itself; call it to ask earlier.
   * Browsers want it to follow a user gesture, such as a click.
   */
  async requestPermission(): Promise<PushPermission> {
    const notifications = this.#notifications;
    if (!notifications) return "unsupported";
    await notifications.requestPermission(); // the browser asks only while the permission is still "default"
    return this.#refreshPermission();
  }

  /**
   * Subscribes to push and resolves with the outcome (see {@link PushSubscribeResult}), after asking for the
   * notification permission when the user has not answered. It needs the worker to be registered, and waits for it to
   * be active. An existing subscription with the same key is returned as it is. Call it from a user gesture, such as
   * a click, as browsers require for the permission prompt.
   *
   * @example
   * ```ts
   * const result = await push.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY });
   * if (result.status === "subscribed") await sendToServer(result.subscription.toJSON());
   * ```
   */
  async subscribe(options: PushSubscribeOptions): Promise<PushSubscribeResult> {
    if (!this.#notifications || !this.#sw.container) return { status: "unsupported" };
    const registration = await this.#sw.ready;
    if (!registration) return { status: "unavailable" };
    const pushManager = registration.pushManager;
    if (!pushManager) return { status: "unsupported" };
    const permission = await this.requestPermission();
    if (permission === "denied") return { status: "denied" };
    if (permission !== "granted") return { status: "dismissed" };
    await whenActive(registration);
    try {
      const subscription = await pushManager.subscribe({
        userVisibleOnly: options.userVisibleOnly ?? true,
        applicationServerKey: options.applicationServerKey,
      });
      return { status: "subscribed", subscription };
    } catch (error) {
      // A permission revoked while subscribing is a denial, not a failure.
      return this.#refreshPermission() === "denied" ? { status: "denied" } : { status: "failed", error };
    }
  }

  /**
   * The current push subscription, or `null` when there is none, the browser does not support push, or the worker
   * is not registered. It does not ask for the permission.
   */
  async getSubscription(): Promise<PushSubscriptionLike | null> {
    const registration = await this.#sw.ready;
    this.#refreshPermission();
    if (!registration?.pushManager) return null;
    try {
      return await registration.pushManager.getSubscription();
    } catch {
      return null;
    }
  }

  /**
   * Cancels the push subscription and resolves with whether it did. It resolves `false` when there was no
   * subscription, push is unsupported or cancelling failed. Tell the app's server to forget the subscription too.
   */
  async unsubscribe(): Promise<boolean> {
    const subscription = await this.getSubscription();
    if (!subscription) return false;
    try {
      return await subscription.unsubscribe();
    } catch {
      return false;
    }
  }

  #refreshPermission(): PushPermission {
    const permission = toPermission(this.#notifications?.permission);
    this.#permission.set(permission);
    return permission;
  }
}

/** Resolves once the registration has an active worker, which `pushManager.subscribe` requires, or its worker failed. */
async function whenActive(registration: ServiceWorkerRegistrationLike): Promise<void> {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (!registration.active && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", check);
      resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}
