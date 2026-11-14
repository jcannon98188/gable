// The parts of a service worker's global scope that worker code runs against.
//
// These are structural types rather than the WebWorker lib's ServiceWorkerGlobalScope because Gable compiles with the
// DOM lib, and the DOM and WebWorker libs cannot be loaded together. A real worker's `self` satisfies them, and so
// does the in-memory scope the package's unit tests use.

/** An install or activate event: the worker extends its lifetime until the promises passed to `waitUntil` settle. */
export interface WorkerExtendableEvent {
  /** `"install"` or `"activate"` for a lifecycle event, `"fetch"` for a fetch event, `"message"` for a message event. */
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
  /** The origin's Cache storage. */
  readonly caches: CacheStorage;
  /** The origin's clients. */
  readonly clients: WorkerClients;
  /** Makes the network request the worker itself needs. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Lets a waiting worker activate without waiting for the old version's clients to close. */
  skipWaiting(): Promise<void>;
  /** Listens for a worker event. */
  addEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void;
  /** Stops listening for a worker event. */
  removeEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void;
}
