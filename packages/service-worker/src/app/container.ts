// The parts of the page's service worker API (`navigator.serviceWorker`) the app-side services use.
//
// These are structural types, as core's WorkerScope is: the browser's ServiceWorkerContainer satisfies them, and so
// does the in-memory browser the package's unit tests drive. The services read worker state only through the message
// protocol (core/messages.ts) and the registration's standard `installing`, `waiting` and `active` slots, so they work
// with the default worker and with a custom one.

/** A service worker as the page sees it: a `ServiceWorker` in the browser. */
export interface ServiceWorkerLike {
  /** Where the worker is in its lifecycle: `"installing"`, `"installed"`, `"activating"`, `"activated"` or `"redundant"`. */
  readonly state: string;
  /** Sends `message` to the worker's message event. */
  postMessage(message: unknown): void;
  /** Listens for changes of {@link ServiceWorkerLike.state}. */
  addEventListener(type: "statechange", listener: () => void): void;
  /** Stops listening for changes of {@link ServiceWorkerLike.state}. */
  removeEventListener(type: "statechange", listener: () => void): void;
}

/** A push subscription: a `PushSubscription` in the browser. Send {@link PushSubscriptionLike.toJSON} to your server. */
export interface PushSubscriptionLike {
  /** The push service URL the server sends this subscription's pushes to. */
  readonly endpoint: string;
  /** When the subscription expires, as a time in milliseconds since the epoch, or `null` when it does not. */
  readonly expirationTime: number | null;
  /** The subscription as plain data for the server: the `endpoint`, the `expirationTime` and the encryption `keys`. */
  toJSON(): { endpoint?: string; expirationTime?: number | null; keys?: Record<string, string> };
  /** Cancels the subscription. Resolves with whether it was cancelled. */
  unsubscribe(): Promise<boolean>;
}

/** What {@link PushManagerLike.subscribe} is given: a `PushSubscriptionOptionsInit` in the browser. */
export interface PushSubscribeInit {
  /** Whether every push shows a notification. Chromium-based browsers accept only `true`. */
  userVisibleOnly?: boolean;
  /** The server's VAPID public key, as a base64url string or its bytes. */
  applicationServerKey?: BufferSource | string | null;
}

/** The registration's push API: a `PushManager` in the browser. */
export interface PushManagerLike {
  /** Subscribes to push, or returns the existing subscription. Needs an active worker and the notification permission. */
  subscribe(options?: PushSubscribeInit): Promise<PushSubscriptionLike>;
  /** The current subscription, or `null` when there is none. */
  getSubscription(): Promise<PushSubscriptionLike | null>;
}

/**
 * The page's notification permission API: the global `Notification` in the browser. {@link provideServiceWorker}
 * provides it, or `null` where the browser has no notifications (push is then unsupported).
 */
export interface NotificationsLike {
  /** The permission the user gave: `"default"` (not asked or dismissed), `"granted"` or `"denied"`. */
  readonly permission: string;
  /** Asks the user, unless they already answered, and resolves with the permission. */
  requestPermission(): Promise<string>;
}

/** A service worker registration as the page sees it: a `ServiceWorkerRegistration` in the browser. */
export interface ServiceWorkerRegistrationLike {
  /** The registration's push API. Left out by a browser without push, such as Safari outside an installed web app. */
  readonly pushManager?: PushManagerLike;
  /** The version being installed, if any. */
  readonly installing: ServiceWorkerLike | null;
  /** The version that installed and waits to take over, if any. */
  readonly waiting: ServiceWorkerLike | null;
  /** The version in charge, if any. */
  readonly active: ServiceWorkerLike | null;
  /** Fetches the worker script and installs it when it changed. */
  update(): Promise<unknown>;
}

/** A message the page received from a service worker. */
export interface ServiceWorkerMessageEventLike {
  /** A structured clone of what the worker posted. */
  readonly data: unknown;
}

/** The page's service worker API: `navigator.serviceWorker` in the browser. */
export interface ServiceWorkerContainerLike {
  /** The worker controlling this page, or `null` when the page is not controlled (a first visit, a hard reload). */
  readonly controller: ServiceWorkerLike | null;
  /** Registers the worker script at `scriptURL`, or returns the existing registration for it. */
  register(scriptURL: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistrationLike>;
  /** Listens for messages from service workers. */
  addEventListener(type: "message", listener: (event: ServiceWorkerMessageEventLike) => void): void;
  /** Listens for the page getting a new controlling worker. */
  addEventListener(type: "controllerchange", listener: () => void): void;
  /** Stops listening for messages from service workers. */
  removeEventListener(type: "message", listener: (event: ServiceWorkerMessageEventLike) => void): void;
  /** Stops listening for the page getting a new controlling worker. */
  removeEventListener(type: "controllerchange", listener: () => void): void;
  /** Starts delivering messages before the document has loaded. The browser has it; a fake may leave it out. */
  startMessages?(): void;
}
