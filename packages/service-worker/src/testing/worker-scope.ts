// An in-memory service worker scope for unit tests (ADR 0022: worker behaviour is tested in production builds and
// with an in-memory worker scope in unit tests). It implements core's WorkerScope, so worker code written against core
// runs on it unchanged, and adds the driver side a test needs: dispatching lifecycle and fetch events, a pluggable
// network, and connected clients whose messages are recorded.
//
// It runs under vitest in Node and inside the engine-suites harness, so it uses only Request, Response and Headers
// basics (no Request.clone, no Node built-ins).
import type { WorkerEventMap, WorkerExtendableEvent, WorkerFetchEvent, WorkerScope } from "../core/index.js";
import type { WorkerClient, WorkerMessageEvent } from "../core/index.js";
import type { WorkerNotification, WorkerNotificationEvent, WorkerPushEvent, WorkerPushMessageData, WorkerSyncEvent } from "../core/index.js";
import { InMemoryRegistration, type InMemorySyncManager } from "./registration.js";
import { InMemoryCacheStorage, type ToRequest } from "./caches.js";
import { type ConnectClientOptions, type InMemoryClient, InMemoryClients } from "./clients.js";

/** Where the worker is in its lifecycle, as ServiceWorker.state reports it (plus "parsed" before install). */
export type WorkerState = "parsed" | "installing" | "installed" | "activating" | "activated" | "redundant";

type Listener = (event: never) => void;

const invalidState = (message: string) => new DOMException(message, "InvalidStateError");

/**
 * Tracks the promises an event was extended with. As in the browser, `waitUntil` is accepted while the event is being
 * dispatched or while earlier extensions are still pending, and throws InvalidStateError after that.
 */
class Extension {
  readonly #pending: Promise<unknown>[] = [];
  #dispatching = true;
  #outstanding = 0;

  waitUntil(promise: Promise<unknown>): void {
    if (!this.#dispatching && this.#outstanding === 0) throw invalidState("waitUntil called after the event finished");
    this.#outstanding++;
    const tracked = Promise.resolve(promise).finally(() => this.#outstanding--);
    tracked.catch(() => {});
    this.#pending.push(tracked);
  }

  /** Ends the synchronous dispatch. */
  dispatched(): void {
    this.#dispatching = false;
  }

  /** Resolves once every extension promise settled, including ones added meanwhile; rejects with the first rejection. */
  async settled(): Promise<void> {
    let firstError: { error: unknown } | undefined;
    for (let i = 0; i < this.#pending.length; i++) {
      try {
        await this.#pending[i];
      } catch (error) {
        firstError ??= { error };
      }
    }
    if (firstError) throw firstError.error;
  }
}

/** Answers the worker's own network requests. */
export type Network = (request: Request) => Response | Promise<Response>;

/** Options for {@link createWorkerScope}. */
export interface WorkerScopeOptions {
  /** The origin relative URLs resolve against. Defaults to `"https://app.test"`. */
  origin?: string;
  /** The network. Defaults to {@link offline}. */
  network?: Network;
  /** Whether the browser has background sync. Defaults to `true`; `false` leaves `registration.sync` undefined. */
  backgroundSync?: boolean;
  /** The sync manager to use, such as one shared by every version of a registration. Defaults to a new one. */
  syncManager?: InMemorySyncManager;
  /**
   * Cache storage to share, such as another scope's: successive worker versions of one origin share Cache storage
   * in the browser. Defaults to new, empty storage. Shared storage's `Cache.add` uses the network of the scope that
   * created it.
   */
  caches?: InMemoryCacheStorage;
}

/** Options for {@link InMemoryWorkerScope.dispatchNotificationClick}. */
export interface NotificationClickInit {
  /** The action button clicked. Defaults to `""`, a click on the notification itself. */
  action?: string;
}

/** Options for {@link InMemoryWorkerScope.dispatchSync}. */
export interface SyncInit {
  /** Whether the browser gives up on the tag if this attempt fails. Defaults to `false`. */
  lastChance?: boolean;
}

/** The request a {@link InMemoryWorkerScope.dispatchFetch} makes, plus the fetch event's fields. */
export interface FetchEventInit extends RequestInit {
  /** The id of the client making the request. Defaults to `""`, a navigation with no client yet. */
  clientId?: string;
  /**
   * `"navigate"` makes the request a navigation, which Node's Request cannot be built as: the request reports
   * `mode` `"navigate"` and, unless {@link destination} says otherwise, `destination` `"document"`.
   */
  mode?: RequestMode;
  /** What the request is for, as `Request.destination` reports it (`"image"`, `"script"`, ...). Defaults to `""`. */
  destination?: RequestDestination;
}

/** Options for {@link InMemoryWorkerScope.dispatchMessage}. */
export interface DispatchMessageOptions {
  /** The client posting the message. Defaults to none: the event's `source` is `null`. */
  source?: WorkerClient;
}

/** A network that is down: every request rejects with a TypeError, as `fetch` does offline. */
export const offline: Network = (request) => {
  throw new TypeError(`Failed to fetch ${request.url}: the network is offline`);
};

/** An in-memory worker scope. Create one with {@link createWorkerScope}. */
export class InMemoryWorkerScope implements WorkerScope {
  #state: WorkerState = "parsed";
  readonly #listeners = new Map<string, Listener[]>();
  readonly #extensions = new Set<Extension>();
  /** The origin relative URLs resolve against. */
  readonly origin: string;
  /** The network `fetch`, `Cache.add` and unanswered fetch events use. Assign to change it mid-test, e.g. to {@link offline}. */
  network: Network;
  /** The origin's Cache storage. */
  readonly caches: InMemoryCacheStorage;
  /** The origin's clients. Connect one with {@link connectClient}. */
  readonly clients: InMemoryClients;
  /** The worker's registration: the notifications it shows and its background sync tags. */
  readonly registration: InMemoryRegistration;
  #skippedWaiting = false;
  #handlingClicks = 0;

  constructor(options: WorkerScopeOptions = {}) {
    this.origin = new URL(options.origin ?? "https://app.test").origin;
    this.network = options.network ?? offline;
    this.caches = options.caches ?? new InMemoryCacheStorage(this.#toRequest, (request) => this.fetch(request));
    this.clients = new InMemoryClients(
      () => this.#state === "activating" || this.#state === "activated",
      () => this.#state === "activated",
      { origin: this.origin, allowed: () => this.#handlingClicks > 0 },
    );
    this.registration = new InMemoryRegistration({ backgroundSync: options.backgroundSync, syncManager: options.syncManager });
  }

  /** Whether the worker called `skipWaiting()`. */
  get skippedWaiting(): boolean {
    return this.#skippedWaiting;
  }

  async skipWaiting(): Promise<void> {
    this.#skippedWaiting = true;
  }

  /**
   * Connects a client (a page, by default) at `url`, resolved against the origin. It is controlled when the worker
   * is already activated, as a page loaded after activation is; earlier ones wait for `clients.claim()`.
   */
  connectClient(url: string, options?: ConnectClientOptions): InMemoryClient {
    return this.clients.connect(new URL(url, this.origin).href, options);
  }

  /** Makes a network request through {@link network}. */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.network(this.#toRequest(input, init));
  }

  readonly #toRequest: ToRequest = (input, init) => {
    if (input instanceof Request) return init ? new Request(input, init) : input;
    return new Request(new URL(String(input), this.origin).href, init);
  };

  /** The worker's lifecycle state. */
  get state(): WorkerState {
    return this.#state;
  }

  addEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void {
    const list = this.#listeners.get(type) ?? [];
    if (list.includes(listener as Listener)) return; // as in the DOM, the same listener is added once
    list.push(listener as Listener);
    this.#listeners.set(type, list);
  }

  removeEventListener<K extends keyof WorkerEventMap>(type: K, listener: (event: WorkerEventMap[K]) => void): void {
    const list = this.#listeners.get(type);
    if (list) this.#listeners.set(type, list.filter((l) => l !== listener));
  }

  /**
   * Dispatches `install` and waits for its extensions. Rejects, leaving the worker redundant, when an extension
   * rejects or a listener throws.
   */
  async install(): Promise<void> {
    await this.#step("parsed", "installing", "installed", "install");
  }

  /** Dispatches `activate` on an installed worker and waits for its extensions. */
  async activate(): Promise<void> {
    await this.#step("installed", "activating", "activated", "activate");
  }

  /**
   * Dispatches a fetch event for `input`, as a controlled page's request would, and resolves with the response the
   * worker answered with. Without a `respondWith` the request goes to {@link network}. A rejected `respondWith`
   * promise rejects with a TypeError, the network error a page sees. Only an activated worker receives fetch events.
   */
  async dispatchFetch(input: RequestInfo | URL, init: FetchEventInit = {}): Promise<Response> {
    if (this.#state !== "activated") throw invalidState(`a ${this.#state} worker does not receive fetch events`);
    const { clientId = "", destination, ...requestInit } = init;
    const navigate = requestInit.mode === "navigate";
    if (navigate) delete requestInit.mode;
    const request = this.#toRequest(input, Object.keys(requestInit).length ? requestInit : undefined);
    // Request has no settable mode "navigate" or destination, so they are shadowed on the instance.
    if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
    if (navigate || destination !== undefined) {
      Object.defineProperty(request, "destination", { value: destination ?? "document" });
    }
    const extension = new Extension();
    let dispatching = true;
    let answer: Promise<Response> | undefined;
    const event: WorkerFetchEvent = {
      type: "fetch",
      request,
      clientId,
      waitUntil: (p) => extension.waitUntil(p),
      respondWith: (response) => {
        if (!dispatching) throw invalidState("respondWith called after the fetch event was dispatched");
        if (answer) throw invalidState("respondWith already called for this fetch event");
        answer = Promise.resolve(response);
        // As in the browser, the pending response extends the event, so waitUntil stays callable until it settles.
        extension.waitUntil(answer.then(
          () => {},
          () => {},
        ));
      },
    };
    try {
      for (const listener of [...(this.#listeners.get("fetch") ?? [])]) (listener as (e: WorkerFetchEvent) => void)(event);
    } finally {
      dispatching = false;
      extension.dispatched();
      this.#extensions.add(extension);
      void extension.settled().then(
        () => this.#extensions.delete(extension),
        () => {},
      );
    }
    if (!answer) return this.fetch(request);
    try {
      return await answer;
    } catch (error) {
      throw new TypeError(`the worker's response to ${request.url} rejected`, { cause: error });
    }
  }

  /** Resolves once the work fetch events extended themselves with has settled; rejects with the first failure. */
  async idle(): Promise<void> {
    const pending = [...this.#extensions];
    this.#extensions.clear();
    let firstError: { error: unknown } | undefined;
    for (const extension of pending) {
      try {
        await extension.settled();
      } catch (error) {
        firstError ??= { error };
      }
    }
    if (firstError) throw firstError.error;
    if (this.#extensions.size) await this.idle();
  }

  /**
   * Dispatches a message event carrying a structured clone of `data`, as a page's `postMessage` to this worker would,
   * and resolves once the event's extensions settle. Rejects when an extension rejects or a listener throws. A
   * waiting (installed) worker receives messages; a redundant one does not.
   */
  async dispatchMessage(data: unknown, options: DispatchMessageOptions = {}): Promise<void> {
    if (this.#state === "redundant") throw invalidState("a redundant worker does not receive messages");
    const extension = new Extension();
    const event: WorkerMessageEvent = {
      type: "message",
      data: structuredClone(data),
      source: options.source ?? null,
      waitUntil: (p) => extension.waitUntil(p),
    };
    try {
      for (const listener of [...(this.#listeners.get("message") ?? [])]) (listener as (e: WorkerMessageEvent) => void)(event);
    } finally {
      extension.dispatched();
    }
    await extension.settled();
  }

  /**
   * Dispatches a push event, as the push service delivering `data` would (`null` for a push without a payload), and
   * resolves once the event's extensions settle. Rejects when an extension rejects or a listener throws. Only an
   * activated worker receives push events.
   */
  async dispatchPush(data: string | ArrayBuffer | null = null): Promise<void> {
    this.#assertActivated("push events");
    const fields: Pick<WorkerPushEvent, "data"> = { data: data === null ? null : pushData(data) };
    await this.#dispatchExtendable("push", fields);
  }

  /**
   * Dispatches a click on `notification`, which the worker showed, and resolves once the event's extensions settle.
   * While the event is being handled the worker may call `clients.openWindow`, as a browser allows after a click.
   * Rejects when an extension rejects or a listener throws.
   */
  async dispatchNotificationClick(notification: WorkerNotification, init: NotificationClickInit = {}): Promise<void> {
    this.#assertActivated("notification clicks");
    const fields: Pick<WorkerNotificationEvent, "notification" | "action"> = { notification, action: init.action ?? "" };
    this.#handlingClicks++;
    try {
      await this.#dispatchExtendable("notificationclick", fields);
    } finally {
      this.#handlingClicks--;
    }
  }

  /**
   * Dispatches the sync event for the registered `tag`, as the browser does once the device is online, and resolves
   * once the event's extensions settle. A successful sync, or a failed last chance, drops the tag; a failed attempt
   * keeps it for the browser to retry. Rejects with the failure.
   */
  async dispatchSync(tag: string, init: SyncInit = {}): Promise<void> {
    this.#assertActivated("sync events");
    const sync = this.registration.sync;
    if (!sync) throw invalidState("this browser has no background sync");
    if (!sync.has(tag)) throw invalidState(`no background sync is registered for "${tag}"`);
    const lastChance = init.lastChance ?? false;
    const fields: Pick<WorkerSyncEvent, "tag" | "lastChance"> = { tag, lastChance };
    try {
      await this.#dispatchExtendable("sync", fields);
    } catch (error) {
      if (lastChance) sync.done(tag);
      throw error;
    }
    sync.done(tag);
  }

  #assertActivated(what: string): void {
    if (this.#state !== "activated") throw invalidState(`a ${this.#state} worker does not receive ${what}`);
  }

  async #step(from: WorkerState, during: WorkerState, to: WorkerState, type: "install" | "activate"): Promise<void> {
    if (this.#state !== from) throw invalidState(`cannot ${type} a worker that is ${this.#state} (expected ${from})`);
    this.#state = during;
    try {
      await this.#dispatchExtendable(type);
    } catch (error) {
      this.#state = "redundant";
      throw error;
    }
    this.#state = to;
  }

  async #dispatchExtendable(type: "install" | "activate" | "push" | "notificationclick" | "sync", fields: object = {}): Promise<void> {
    const extension = new Extension();
    const event: WorkerExtendableEvent = { ...fields, type, waitUntil: (p) => extension.waitUntil(p) };
    try {
      for (const listener of [...(this.#listeners.get(type) ?? [])]) (listener as (e: WorkerExtendableEvent) => void)(event);
    } finally {
      extension.dispatched();
    }
    await extension.settled();
  }
}

/** A push payload: `text()`, `json()` and `arrayBuffer()` over its bytes. */
function pushData(data: string | ArrayBuffer): WorkerPushMessageData {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data.slice(0));
  const text = () => new TextDecoder().decode(bytes);
  return {
    text,
    json: () => JSON.parse(text()),
    arrayBuffer: () => bytes.slice().buffer,
  };
}

/** Creates an in-memory worker scope. */
export function createWorkerScope(options?: WorkerScopeOptions): InMemoryWorkerScope {
  return new InMemoryWorkerScope(options);
}
