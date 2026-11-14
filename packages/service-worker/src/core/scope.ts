// The parts of a service worker's global scope that worker code runs against.
//
// These are structural types rather than the WebWorker lib's ServiceWorkerGlobalScope because Gable compiles with the
// DOM lib, and the DOM and WebWorker libs cannot be loaded together. A real worker's `self` satisfies them, and so
// does the in-memory scope the package's unit tests use.

/** An install or activate event: the worker extends its lifetime until the promises passed to `waitUntil` settle. */
export interface WorkerExtendableEvent {
  /** The event type, a key of {@link WorkerEventMap}: `"install"`, `"activate"`, `"fetch"`, `"message"`, `"push"`, `"notificationclick"` or `"sync"`. */
  readonly type: string;
  /** Keeps the event, and the worker, alive until `promise` settles. A rejected install or activate promise fails that step. */
  waitUntil(promise: Promise<unknown>): void;
}

/** A request the worker may answer instead of the network. */
export interface WorkerFetchEvent extends WorkerExtendableEvent {
  /** The request being made. */
  readonly request: Request;
  /** The id of the client that made the request, or `""` for a navigation that has no client yet. */
  readonly clientId: string;
  /** Answers the request. Must be called synchronously during dispatch, at most once. */
  respondWith(response: Response | Promise<Response>): void;
}

/** A window or worker the service worker can see and message. */
export interface WorkerClient {
  /** The client's id, stable for its lifetime. */
  readonly id: string;
  /** The client's URL. */
  readonly url: string;
  /** What kind of client this is. */
  readonly type: "window" | "worker" | "sharedworker";
  /** Sends `message` to the client's `navigator.serviceWorker` message listeners. */
  postMessage(message: unknown): void;
}

/** Options for {@link WorkerClients.matchAll}. */
export interface WorkerClientQueryOptions {
  /** Also return clients this worker does not control. Defaults to `false`. */
  includeUncontrolled?: boolean;
  /** Only return clients of this type. Defaults to `"window"`. */
  type?: WorkerClient["type"] | "all";
}

/** The clients of the worker's origin. */
export interface WorkerClients {
  /** The client with `id`, or `undefined` when there is none. */
  get(id: string): Promise<WorkerClient | undefined>;
  /** The clients matching `options`. */
  matchAll(options?: WorkerClientQueryOptions): Promise<readonly WorkerClient[]>;
  /** Makes this worker the controller of every client in its scope. */
  claim(): Promise<void>;
  /**
   * Opens a new window at `url` and resolves with its client, or `null` when the browser opened it but the worker
   * cannot see it (another origin). Browsers allow it only while the worker handles a notification click.
   */
  openWindow(url: string | URL): Promise<WorkerClient | null>;
}

/** The payload of a push message, a PushMessageData in the browser. */
export interface WorkerPushMessageData {
  /** The payload as UTF-8 text. */
  text(): string;
  /** The payload parsed as JSON. Throws a SyntaxError when it is not JSON. */
  json(): unknown;
  /** The payload's bytes. */
  arrayBuffer(): ArrayBuffer;
}

/** A push message from the push service, a PushEvent in the browser. */
export interface WorkerPushEvent extends WorkerExtendableEvent {
  /** The payload, or `null` when the push carried none. */
  readonly data: WorkerPushMessageData | null;
}

/** An action button on a notification. */
export interface WorkerNotificationAction {
  /** The action's id, reported as the click's `action` when the button is clicked. */
  readonly action: string;
  /** The button's label. */
  readonly title: string;
  /** The button's icon URL. */
  readonly icon?: string;
}

/** Options for {@link WorkerRegistration.showNotification}, a subset of the browser's NotificationOptions. */
export interface WorkerNotificationOptions {
  /** The body text. */
  readonly body?: string;
  /** A tag: showing a notification with the tag of one already shown replaces it. */
  readonly tag?: string;
  /** Data kept with the notification, structured-cloned, for the click handler. */
  readonly data?: unknown;
  /** The icon URL. */
  readonly icon?: string;
  /** The badge URL, for the status bar on mobile. */
  readonly badge?: string;
  /** Whether the notification stays until the user acts on it. */
  readonly requireInteraction?: boolean;
  /** Whether the notification is shown without sound or vibration. */
  readonly silent?: boolean;
  /** Action buttons. Browsers show only a few (see `Notification.maxActions`) and some show none. */
  readonly actions?: readonly WorkerNotificationAction[];
}

/** A notification the worker showed, a Notification in the browser. */
export interface WorkerNotification {
  /** The title. */
  readonly title: string;
  /** The body text, `""` when it has none. */
  readonly body: string;
  /** The tag, `""` when it has none. */
  readonly tag: string;
  /** The data it was shown with, `null` when it has none. */
  readonly data: unknown;
  /** Removes the notification. */
  close(): void;
}

/** A click on a notification the worker showed, a NotificationEvent in the browser. */
export interface WorkerNotificationEvent extends WorkerExtendableEvent {
  /** The notification that was clicked. */
  readonly notification: WorkerNotification;
  /** The action button that was clicked, or `""` for a click on the notification itself. */
  readonly action: string;
}

/** Background sync registrations, a SyncManager in the browser. */
export interface WorkerSyncManager {
  /** Asks for a `sync` event with `tag` once the device is online. Registering a pending tag again does nothing. */
  register(tag: string): Promise<void>;
  /** The tags registered and not yet synced. */
  getTags(): Promise<string[]>;
}

/** A background sync, a SyncEvent in the browser. */
export interface WorkerSyncEvent extends WorkerExtendableEvent {
  /** The tag the sync was registered with. */
  readonly tag: string;
  /** Whether the browser will give up on this tag if this attempt fails. */
  readonly lastChance: boolean;
}

/** The worker's registration, as far as Gable's worker code uses it. */
export interface WorkerRegistration {
  /** Shows a notification. Needs the user's notification permission. */
  showNotification(title: string, options?: WorkerNotificationOptions): Promise<void>;
  /** The notifications this worker shows that are still open, only those with `filter.tag` when it is given. */
  getNotifications(filter?: { tag?: string }): Promise<readonly WorkerNotification[]>;
  /** Background sync, `undefined` in browsers without it (at the time of writing, only Chromium-based ones have it). */
  readonly sync?: WorkerSyncManager;
}

/** The events a worker scope dispatches, by type. */
export interface WorkerEventMap {
  /** The worker is installing: prepare caches. */
  install: WorkerExtendableEvent;
  /** The worker is taking over: clean up what the previous version left. */
  activate: WorkerExtendableEvent;
  /** A controlled page made a request. */
  fetch: WorkerFetchEvent;
  /** A page posted a message to the worker. */
  message: WorkerMessageEvent;
  /** The push service delivered a push message. */
  push: WorkerPushEvent;
  /** The user clicked a notification the worker showed. */
  notificationclick: WorkerNotificationEvent;
  /** The browser runs a background sync the worker registered. */
  sync: WorkerSyncEvent;
}

/** A message a page posted to the worker, an ExtendableMessageEvent in the browser. */
export interface WorkerMessageEvent extends WorkerExtendableEvent {
  /** A structured clone of the posted message. */
  readonly data: unknown;
  /** The client that posted it, or `null` when it did not come from a client. */
  readonly source: WorkerClient | null;
}

/** The global scope a service worker runs in, as far as Gable's worker code uses it. */
export interface WorkerScope {
  /** The worker's origin, such as `"https://app.example"`. Path patterns in a fetch router match requests to it. */
  readonly origin: string;
  /** The origin's Cache storage. */
  readonly caches: CacheStorage;
  /** The origin's clients. */
  readonly clients: WorkerClients;
  /** The worker's registration: notifications and background sync. */
  readonly registration: WorkerRegistration;
  /** Makes the network request the worker itself needs. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Lets a waiting worker activate without waiting for the old version's clients to close. */
  skipWaiting(): Promise<void>;
  /** Listens for a worker event. */
  addEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void;
  /** Stops listening for a worker event. */
  removeEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void;
}
