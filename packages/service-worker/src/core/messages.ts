// The message protocol between a Gable service worker and the app it serves (ADR 0021). It is public API: the
// app-side services read these messages from the default worker and from custom workers alike, so a change to a
// message's shape is a breaking change. New message types and new optional fields are additive.
import type { WorkerMessageEvent, WorkerScope } from "./scope.js";

/**
 * The marker every protocol message carries in its `protocol` field, so the app and the worker can tell protocol
 * messages from their own. The number after `@` is the protocol's major version.
 */
export const SW_PROTOCOL = "gable-sw@1";

/** The type of {@link SW_PROTOCOL}. */
export type SwProtocol = typeof SW_PROTOCOL;

/**
 * Where a worker error happened. `install`, `activate` and `update` are the lifecycle steps of
 * {@link lifecycle}; `runtime` is anything else worker code reports, such as a failed background refresh.
 */
export type WorkerErrorPhase = "install" | "activate" | "update" | "runtime";

/** An error as it crosses to the app: its name and message, since an Error object does not survive postMessage intact. */
export interface WorkerErrorInfo {
  /** The error's name, such as `"TypeError"`, or `"Error"` when the thrown value was not an error. */
  readonly name: string;
  /** The error's message, or the thrown value as a string. */
  readonly message: string;
}

/**
 * Sent to every window client when a version has installed. A version that replaces an earlier one then waits until
 * the app sends {@link ActivateUpdateRequest}; the very first version activates straight away, so a page with no
 * controlling worker can ignore this message.
 */
export interface VersionReadyMessage {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "version-ready";
  /** The version that installed. */
  readonly version: string;
}

/** Sent to every window client when a version has activated and controls the origin's pages from now on. */
export interface VersionActivatedMessage {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "version-activated";
  /** The version that activated. */
  readonly version: string;
}

/** Sent to every window client when the worker fails. A failed install leaves the previous version in charge. */
export interface WorkerErrorMessage {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "error";
  /** The version of the worker that failed. */
  readonly version: string;
  /** Where it failed. */
  readonly phase: WorkerErrorPhase;
  /** What went wrong. */
  readonly error: WorkerErrorInfo;
}

/** Sent to every window client when the worker receives a push message, so open pages can react to it. */
export interface PushMessage {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "push";
  /** The version of the worker that received the push. */
  readonly version: string;
  /** The push payload: parsed JSON when it is JSON, otherwise its text, or `null` when the push carried none. */
  readonly data: unknown;
}

/** The parts of a clicked notification that cross to the app. */
export interface NotificationInfo {
  /** The notification's title. */
  readonly title: string;
  /** The notification's body text, `""` when it has none. */
  readonly body: string;
  /** The notification's tag, `""` when it has none. */
  readonly tag: string;
  /** The data the notification was shown with, `null` when it has none. */
  readonly data: unknown;
}

/** Sent to every window client when the user clicks a notification the worker showed. */
export interface NotificationClickMessage {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "notification-click";
  /** The version of the worker that handled the click. */
  readonly version: string;
  /** The action button that was clicked, or `""` for a click on the notification itself. */
  readonly action: string;
  /** The notification that was clicked. */
  readonly notification: NotificationInfo;
}

/** A message the worker sends to the app. Narrow on `type`. */
export type WorkerToAppMessage =
  | VersionReadyMessage
  | VersionActivatedMessage
  | WorkerErrorMessage
  | PushMessage
  | NotificationClickMessage;

/**
 * Sent by the app to a waiting worker to have it take over, which is how `activateUpdate()` applies an update. The
 * worker runs its update hook, then skips waiting; it answers with {@link VersionActivatedMessage} once it is active.
 */
export interface ActivateUpdateRequest {
  /** The protocol marker, {@link SW_PROTOCOL}. */
  readonly protocol: SwProtocol;
  /** The message type. */
  readonly type: "activate-update";
}

/** A message the app sends to the worker. Narrow on `type`. */
export type AppToWorkerMessage = ActivateUpdateRequest;

const PHASES: readonly string[] = ["install", "activate", "update", "runtime"] satisfies readonly WorkerErrorPhase[];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isProtocolMessage = (value: unknown): value is Record<string, unknown> => isRecord(value) && value.protocol === SW_PROTOCOL;

/** Whether `data`, received from `navigator.serviceWorker`, is a well-formed {@link WorkerToAppMessage}. */
export function isWorkerToAppMessage(data: unknown): data is WorkerToAppMessage {
  if (!isProtocolMessage(data) || typeof data.version !== "string") return false;
  switch (data.type) {
    case "version-ready":
    case "version-activated":
      return true;
    case "error":
      return (
        typeof data.phase === "string" &&
        PHASES.includes(data.phase) &&
        isRecord(data.error) &&
        typeof data.error.name === "string" &&
        typeof data.error.message === "string"
      );
    case "push":
      return true;
    case "notification-click":
      return (
        typeof data.action === "string" &&
        isRecord(data.notification) &&
        typeof data.notification.title === "string" &&
        typeof data.notification.body === "string" &&
        typeof data.notification.tag === "string"
      );
    default:
      return false;
  }
}

/** Whether `data`, received in the worker's message event, is a well-formed {@link AppToWorkerMessage}. */
export function isAppToWorkerMessage(data: unknown): data is AppToWorkerMessage {
  return isProtocolMessage(data) && data.type === "activate-update";
}

/** Turns a thrown value into the {@link WorkerErrorInfo} that crosses to the app. */
export function toWorkerErrorInfo(error: unknown): WorkerErrorInfo {
  if (isRecord(error) && typeof error.name === "string" && typeof error.message === "string") {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
}

/** Handles a request from the app. A returned promise keeps the message event, and the worker, alive until it settles. */
export type AppRequestListener = (request: AppToWorkerMessage, event: WorkerMessageEvent) => void | Promise<void>;

/** The worker's side of the protocol: typed sends to the app and typed requests from it. Create one with {@link createAppChannel}. */
export interface AppChannel {
  /** Posts `message` to every window client of the origin, including pages the worker does not control yet. */
  broadcast(message: WorkerToAppMessage): Promise<void>;
  /** Broadcasts a {@link WorkerErrorMessage} for `error`, thrown by `version` during `phase`. */
  reportError(version: string, phase: WorkerErrorPhase, error: unknown): Promise<void>;
  /** Calls `listener` for each protocol request from the app; other messages are left to other listeners. Returns a function that stops listening. */
  onRequest(listener: AppRequestListener): () => void;
}

/** Creates the worker's side of the protocol on `self`. */
export function createAppChannel(self: WorkerScope): AppChannel {
  const broadcast = async (message: WorkerToAppMessage): Promise<void> => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage(message);
  };
  return {
    broadcast,
    reportError: (version, phase, error) =>
      broadcast({ protocol: SW_PROTOCOL, type: "error", version, phase, error: toWorkerErrorInfo(error) }),
    onRequest(listener) {
      const onMessage = (event: WorkerMessageEvent) => {
        if (!isAppToWorkerMessage(event.data)) return;
        const result = listener(event.data, event);
        if (result) event.waitUntil(result);
      };
      self.addEventListener("message", onMessage);
      return () => self.removeEventListener("message", onMessage);
    },
  };
}
