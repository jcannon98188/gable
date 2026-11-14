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

/** A service worker registration as the page sees it: a `ServiceWorkerRegistration` in the browser. */
export interface ServiceWorkerRegistrationLike {
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
