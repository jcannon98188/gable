// Push and notification-click events from the worker, as Observables (ADR 0021). The worker forwards them to open
// pages with the protocol's push and notification-click messages.
import { inject } from "@gable/core";
import { filter, map, type Observable } from "rxjs";
import type { NotificationClickMessage, NotificationInfo, PushMessage, WorkerToAppMessage } from "../core/messages.js";
import { SwRegistration } from "./registration.js";

/** A click on a notification the worker showed. */
export interface NotificationClick {
  /** The action button that was clicked, or `""` for a click on the notification itself. */
  readonly action: string;
  /** The notification that was clicked. */
  readonly notification: NotificationInfo;
}

/**
 * Push messages and notification clicks, as the worker forwards them to the app's open pages. Injecting it registers
 * the worker (through {@link SwRegistration}), in production builds only; nothing is emitted in development.
 *
 * @example
 * ```ts
 * export class Inbox {
 *   static meta = { selector: "app-inbox", template: html`...` };
 *
 *   push = inject(SwPush);
 *   latest = toSignal(this.push.messages);
 * }
 * ```
 */
export class SwPush {
  static scope = "root";

  readonly #sw = inject(SwRegistration);

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
}
