// Typed push and notification-click handlers (ADR 0021). Besides running the worker's own handler, each forwards its
// event to the app's open pages with the protocol's push and notification-click messages (messages.ts), which the
// app side's SwPush exposes as Observables.
import { type AppChannel, createAppChannel, SW_PROTOCOL, type NotificationInfo } from "./messages.js";
import type {
  WorkerClient,
  WorkerNotification,
  WorkerNotificationEvent,
  WorkerNotificationOptions,
  WorkerPushEvent,
  WorkerPushMessageData,
  WorkerScope,
} from "./scope.js";

/** What a push handler is told. */
export interface PushContext {
  /** The worker's version, as passed to {@link onPush}. */
  readonly version: string;
  /** The payload: parsed JSON when it is JSON, otherwise its text, or `null` when the push carried none. */
  readonly data: unknown;
  /** The raw payload, for one that is not text, or `null` when the push carried none. */
  readonly message: WorkerPushMessageData | null;
  /**
   * Shows a notification. The push event waits for it, so the browser does not show its own "updated in the
   * background" notice in its place (Chromium does when a push shows none).
   */
  showNotification(title: string, options?: WorkerNotificationOptions): Promise<void>;
  /** The push event itself. */
  readonly event: WorkerPushEvent;
}

/** Handles a push. A returned promise keeps the push event, and the worker, alive until it settles; a rejection, or a throw, fails it. */
export type PushHandler = (context: PushContext) => void | Promise<unknown>;

/** Options for {@link onPush}. */
export interface PushOptions {
  /** The worker's version, sent to the app in the protocol's messages. */
  readonly version: string;
  /** Runs for each push. Without one the push is only forwarded to the app. */
  readonly handle?: PushHandler;
  /** Whether to send each push to the app's open pages as the protocol's push message. Defaults to `true`. */
  readonly forward?: boolean;
}

/** What a notification-click handler is told. */
export interface NotificationClickContext {
  /** The worker's version, as passed to {@link onNotificationClick}. */
  readonly version: string;
  /** The action button that was clicked, or `""` for a click on the notification itself. */
  readonly action: string;
  /** The notification that was clicked. */
  readonly notification: WorkerNotification;
  /** Opens a window at `url`, which a browser allows while the worker handles a click. Resolves with its client, or `null` for another origin. */
  openWindow(url: string | URL): Promise<WorkerClient | null>;
  /** The click event itself. */
  readonly event: WorkerNotificationEvent;
}

/** Handles a notification click. A returned promise keeps the event, and the worker, alive until it settles; a rejection, or a throw, fails it. */
export type NotificationClickHandler = (context: NotificationClickContext) => void | Promise<unknown>;

/** Options for {@link onNotificationClick}. */
export interface NotificationClickOptions {
  /** The worker's version, sent to the app in the protocol's messages. */
  readonly version: string;
  /** Runs for each click. Without one the click is only forwarded to the app. */
  readonly handle?: NotificationClickHandler;
  /** Whether to send each click to the app's open pages as the protocol's notification-click message. Defaults to `true`. */
  readonly forward?: boolean;
  /** Whether to leave the clicked notification open. Defaults to `false`: it is closed, which not every platform does by itself. */
  readonly keepOpen?: boolean;
}

/** Decodes a push payload as the protocol's push message carries it: JSON, else text, else `null`. */
function decode(message: WorkerPushMessageData | null): unknown {
  if (!message) return null;
  const text = message.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The parts of `notification` that cross to the app. */
function toNotificationInfo({ title, body, tag, data }: WorkerNotification): NotificationInfo {
  return { title, body, tag, data };
}

/**
 * Handles the worker's push events: decodes the payload, runs `options.handle` with it, and sends the app's open
 * pages the protocol's push message (unless `forward` is `false`). The event lasts until both are done. A failing
 * handler reports a `runtime` error to the app and fails the event. Returns a function that stops handling pushes.
 *
 * @example
 * ```ts
 * onPush(self, {
 *   version,
 *   handle: ({ data, showNotification }) => showNotification("New mail", { body: (data as Mail).subject, data }),
 * });
 * ```
 */
export function onPush(self: WorkerScope, options: PushOptions): () => void {
  const { version, handle, forward = true } = options;
  const channel = createAppChannel(self);
  const listener = (event: WorkerPushEvent) => {
    const data = decode(event.data);
    const work: Promise<unknown>[] = [];
    if (forward) work.push(channel.broadcast({ protocol: SW_PROTOCOL, type: "push", version, data }));
    if (handle) {
      const context: PushContext = {
        version,
        data,
        message: event.data,
        showNotification: (title, notificationOptions) => {
          const shown = self.registration.showNotification(title, notificationOptions);
          event.waitUntil(shown);
          return shown;
        },
        event,
      };
      work.push(runHandler(channel, version, () => handle(context)));
    }
    event.waitUntil(Promise.all(work));
  };
  self.addEventListener("push", listener);
  return () => self.removeEventListener("push", listener);
}

/**
 * Handles clicks on the worker's notifications: closes the notification (unless `keepOpen`), runs `options.handle`
 * with the clicked action, and sends the app's open pages the protocol's notification-click message (unless
 * `forward` is `false`). The event lasts until both are done. A failing handler reports a `runtime` error to the
 * app and fails the event. Returns a function that stops handling clicks.
 *
 * @example
 * ```ts
 * onNotificationClick(self, {
 *   version,
 *   handle: ({ action, notification, openWindow }) => (action === "" ? openWindow(`/mail/${(notification.data as Mail).id}`) : undefined),
 * });
 * ```
 */
export function onNotificationClick(self: WorkerScope, options: NotificationClickOptions): () => void {
  const { version, handle, forward = true, keepOpen = false } = options;
  const channel = createAppChannel(self);
  const listener = (event: WorkerNotificationEvent) => {
    const { notification, action } = event;
    if (!keepOpen) notification.close();
    const work: Promise<unknown>[] = [];
    if (forward) {
      work.push(
        channel.broadcast({ protocol: SW_PROTOCOL, type: "notification-click", version, action, notification: toNotificationInfo(notification) }),
      );
    }
    if (handle) {
      const context: NotificationClickContext = {
        version,
        action,
        notification,
        openWindow: (url) => self.clients.openWindow(url),
        event,
      };
      work.push(runHandler(channel, version, () => handle(context)));
    }
    event.waitUntil(Promise.all(work));
  };
  self.addEventListener("notificationclick", listener);
  return () => self.removeEventListener("notificationclick", listener);
}

/** Runs a handler; a failure is reported to the app as a runtime error and rethrown. */
async function runHandler(channel: AppChannel, version: string, run: () => void | Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    await channel.reportError(version, "runtime", error);
    throw error;
  }
}
