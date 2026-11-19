// @gable/service-worker: the app side, injectable services for registration and updates (ADR 0022).
// It reads workers through the message protocol only, so it works with the default worker and a custom one. It must
// not import from the runtime.
export type {
  NotificationsLike,
  PushManagerLike,
  PushSubscribeInit,
  PushSubscriptionLike,
  ServiceWorkerContainerLike,
  ServiceWorkerLike,
  ServiceWorkerMessageEventLike,
  ServiceWorkerRegistrationLike,
  SyncManagerLike,
} from "./app/container.js";
export {
  provideServiceWorker,
  SERVICE_WORKER_CONTAINER,
  SERVICE_WORKER_NOTIFICATIONS,
  SERVICE_WORKER_OPTIONS,
  SwRegistration,
} from "./app/registration.js";
export type { ServiceWorkerOptions } from "./app/registration.js";
export { SwUpdates } from "./app/updates.js";
export type { VersionEvent } from "./app/updates.js";
export { SwPush } from "./app/push.js";
export { SwSync } from "./app/sync.js";
export type { NotificationClick, PushPermission, PushSubscribeOptions, PushSubscribeResult } from "./app/push.js";
export type {
  NotificationInfo,
  VersionActivatedMessage,
  VersionReadyMessage,
  WorkerErrorInfo,
  WorkerErrorMessage,
  WorkerToAppMessage,
} from "./core/messages.js";
