// An in-memory browser for testing the app side: it plays `navigator.serviceWorker` for any number of pages of one
// origin, and runs each worker version on its own in-memory worker scope (worker-scope.ts). It does what the browser
// does around a worker and nothing more: it fetches the script for a URL from `scripts`, installs a changed script
// as a new version, activates it once nothing holds it back (no active version, skipWaiting(), or no page left that
// the active version controls), switches controlled pages to the new version (firing controllerchange) and delivers what workers
// post to the pages' message listeners. What the worker tells the app is up to the worker script.
import type { WorkerScope } from "../core/index.js";
import type {
  NotificationsLike,
  ServiceWorkerContainerLike,
  ServiceWorkerLike,
  ServiceWorkerMessageEventLike,
  ServiceWorkerRegistrationLike,
} from "../app/container.js";
import type { InMemoryCacheStorage } from "./caches.js";
import type { InMemoryClient } from "./clients.js";
import { InMemoryPermission, InMemoryPushManager, type NotificationPermissionState } from "./push.js";
import { createWorkerScope, type InMemoryWorkerScope, type Network } from "./worker-scope.js";

/** A worker script: what the worker file runs against its `self`. */
export type WorkerScript = (self: WorkerScope) => void;

/** The page-side state of a worker, as `ServiceWorker.state` reports it. */
export type PageWorkerState = "installing" | "installed" | "activating" | "activated" | "redundant";

/** Options for {@link createBrowser}. */
export interface InMemoryBrowserOptions {
  /** The origin pages and workers live on. Defaults to `"https://app.test"`. */
  origin?: string;
  /** The network worker scopes use. Defaults to offline. */
  network?: Network;
  /** The origin's notification permission at the start. Defaults to `"default"`: the user was not asked. */
  notificationPermission?: NotificationPermissionState;
  /** What the user answers the permission prompt: `"granted"` (the default), `"denied"`, or `"default"` to dismiss it. */
  permissionAnswer?: NotificationPermissionState;
  /** Whether registrations have a push manager. Defaults to `true`; `false` models a browser without push. */
  push?: boolean;
}

/** One worker version: a script running on its own scope. */
class WorkerVersion {
  state: PageWorkerState = "installing";
  readonly listeners = new Set<() => void>();
  readonly clients = new Map<InMemoryPage, InMemoryClient>();

  constructor(
    readonly script: WorkerScript,
    readonly scope: InMemoryWorkerScope,
  ) {}

  setState(state: PageWorkerState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

interface Registration {
  readonly scriptURL: string;
  readonly push: InMemoryPushManager;
  installing: WorkerVersion | null;
  waiting: WorkerVersion | null;
  active: WorkerVersion | null;
}

/** An in-memory browser. Create one with {@link createBrowser}. */
export class InMemoryBrowser {
  /** The origin pages and workers live on. */
  readonly origin: string;
  /** The worker script served at each absolute URL. Set a new one to deploy a new version; delete it to serve a 404. */
  readonly scripts = new Map<string, WorkerScript>();
  /** The origin's notification permission, and the answer the user gives when asked. Change it to model settings. */
  readonly permission: InMemoryPermission;
  readonly #network: Network | undefined;
  readonly #pushSupported: boolean;
  #endpoints = 0;
  readonly #registrations = new Map<string, Registration>();
  readonly #pages = new Set<InMemoryPage>();
  readonly #pending = new Set<Promise<unknown>>();
  #caches: InMemoryCacheStorage | undefined;

  constructor(options: InMemoryBrowserOptions = {}) {
    this.origin = new URL(options.origin ?? "https://app.test").origin;
    this.#network = options.network;
    this.#pushSupported = options.push ?? true;
    this.permission = new InMemoryPermission(options.notificationPermission, options.permissionAnswer);
  }

  /** @internal Whether registrations have a push manager. */
  get pushSupported(): boolean {
    return this.#pushSupported;
  }

  /** The endpoints of the push subscriptions of the registration for `url`: none, or one. */
  pushSubscriptions(url: string): string[] {
    const endpoint = this.#registrations.get(new URL(url, this.origin).href)?.push.endpoint;
    return endpoint ? [endpoint] : [];
  }

  /**
   * Plays the push service: delivers `payload` to the worker of the subscription with `endpoint`, as a push event.
   * Resolves `false` when no subscription has that endpoint, or the permission is no longer granted (the push is
   * dropped, as a browser does); `true` once the worker handled it. Rejects when the worker's push handler fails.
   */
  async deliverPush(endpoint: string, payload: string | ArrayBuffer | null = null): Promise<boolean> {
    for (const registration of this.#registrations.values()) {
      if (registration.push.endpoint !== endpoint) continue;
      if (this.permission.permission !== "granted" || !registration.active) return false;
      await registration.active.scope.dispatchPush(payload);
      return true;
    }
    return false;
  }

  /** Serves `script` at `url`, resolved against the origin. */
  deploy(url: string, script: WorkerScript): void {
    this.scripts.set(new URL(url, this.origin).href, script);
  }

  /**
   * Opens a page at `url`. It is controlled by the active version, if there is one, as a page loaded after
   * activation is.
   */
  openPage(url = "/"): InMemoryPage {
    const page = new InMemoryPage(this, new URL(url, this.origin).href);
    this.#pages.add(page);
    for (const registration of this.#registrations.values()) {
      for (const version of [registration.installing, registration.waiting, registration.active]) {
        if (version) this.#connect(page, version, version === registration.active);
      }
      if (registration.active) page.controllerVersion = registration.active;
    }
    return page;
  }

  /** Resolves once the browser's background work (installs, activations, message delivery) has finished. */
  async settled(): Promise<void> {
    while (this.#pending.size) {
      const pending = [...this.#pending];
      this.#pending.clear();
      await Promise.allSettled(pending);
    }
  }

  /** The worker versions of the registration for `url`, for assertions. */
  versions(url: string): { installing: string | null; waiting: string | null; active: string | null } {
    const registration = this.#registrations.get(new URL(url, this.origin).href);
    const state = (v: WorkerVersion | null | undefined) => (v ? v.state : null);
    return { installing: state(registration?.installing), waiting: state(registration?.waiting), active: state(registration?.active) };
  }

  /**
   * The scope of the active version of the registration for `url`, or `null` when none is active: where the push
   * service delivers pushes and where notification clicks and background syncs are dispatched.
   */
  activeScope(url: string): InMemoryWorkerScope | null {
    return this.#registrations.get(new URL(url, this.origin).href)?.active?.scope ?? null;
  }

  /** @internal */
  closed(page: InMemoryPage): void {
    this.#pages.delete(page);
    for (const registration of this.#registrations.values()) {
      for (const version of [registration.installing, registration.waiting, registration.active]) {
        version?.clients.get(page)?.close();
        version?.clients.delete(page);
      }
      void this.track(this.#tryActivate(registration));
    }
  }

  /** @internal */
  track<T>(promise: Promise<T>): Promise<T> {
    this.#pending.add(promise);
    void promise.then(
      () => this.#pending.delete(promise),
      () => this.#pending.delete(promise),
    );
    return promise;
  }

  /** @internal */
  async register(page: InMemoryPage, url: string): Promise<Registration> {
    const scriptURL = new URL(url, page.url).href;
    const existing = this.#registrations.get(scriptURL);
    if (existing) return existing;
    const registration: Registration = {
      scriptURL,
      push: new InMemoryPushManager({
        permission: this.permission,
        hasActiveWorker: () => registration.active !== null,
        newEndpoint: () => `https://push.test/endpoint/${++this.#endpoints}`,
      }),
      installing: null,
      waiting: null,
      active: null,
    };
    this.#registrations.set(scriptURL, registration);
    try {
      await this.update(registration);
    } catch (error) {
      this.#registrations.delete(scriptURL);
      throw error;
    }
    return registration;
  }

  /** @internal Fetches the script and, when it changed, starts installing it as a new version. */
  async update(registration: Registration): Promise<void> {
    const script = this.scripts.get(registration.scriptURL);
    if (!script) throw new TypeError(`Failed to update a ServiceWorker: ${registration.scriptURL} returned 404`);
    const newest = registration.installing ?? registration.waiting ?? registration.active;
    if (newest?.script === script) return;
    // Every version of the origin shares its Cache storage, so a new version sees what the old one stored.
    const scope = createWorkerScope({ origin: this.origin, network: this.#network, caches: this.#caches });
    this.#caches ??= scope.caches;
    const version = new WorkerVersion(script, scope);
    scope.clients.onClaim = () => this.#claimed(version);
    for (const page of this.#pages) this.#connect(page, version, false);
    script(version.scope);
    if (registration.installing) registration.installing.setState("redundant");
    registration.installing = version;
    void this.track(this.#install(registration, version));
  }

  /** @internal Posts `message` from `page` to `version`, then activates it if it skipped waiting. */
  post(page: InMemoryPage, version: WorkerVersion, message: unknown): void {
    if (version.state === "redundant") return;
    const registration = this.#registrationOf(version);
    void this.track(
      (async () => {
        await version.scope.dispatchMessage(message, { source: version.clients.get(page) }).catch(() => {});
        if (registration?.waiting === version && version.scope.skippedWaiting) await this.#activate(registration);
      })(),
    );
  }

  #registrationOf(version: WorkerVersion): Registration | undefined {
    for (const registration of this.#registrations.values()) {
      if ([registration.installing, registration.waiting, registration.active].includes(version)) return registration;
    }
    return undefined;
  }

  /** `clients.claim()` of `version`: every open page switches to it, firing controllerchange on those it did not control. */
  #claimed(version: WorkerVersion): void {
    for (const page of this.#pages) {
      if (page.controllerVersion === version) continue;
      page.controllerVersion = version;
      page.controllerChanged();
    }
  }

  #connect(page: InMemoryPage, version: WorkerVersion, controlled: boolean): void {
    const client = version.scope.connectClient(page.url, { controlled, onMessage: (message) => page.deliver(message) });
    version.clients.set(page, client);
  }

  async #install(registration: Registration, version: WorkerVersion): Promise<void> {
    try {
      await version.scope.install();
    } catch {
      if (registration.installing === version) registration.installing = null;
      version.setState("redundant");
      return;
    }
    if (registration.installing !== version) return;
    registration.installing = null;
    registration.waiting?.setState("redundant");
    registration.waiting = version;
    version.setState("installed");
    await this.#tryActivate(registration);
  }

  /**
   * Activates the waiting version when nothing holds it back, as the browser's Try Activate does: there is no active
   * version, the waiting one skipped waiting, or no page is controlled by the active one any more.
   */
  async #tryActivate(registration: Registration): Promise<void> {
    const waiting = registration.waiting;
    if (!waiting) return;
    const inUse = [...this.#pages].some((page) => registration.active && page.controllerVersion === registration.active);
    if (!registration.active || waiting.scope.skippedWaiting || !inUse) await this.#activate(registration);
  }

  async #activate(registration: Registration): Promise<void> {
    const next = registration.waiting;
    if (!next) return;
    const previous = registration.active;
    registration.waiting = null;
    registration.active = next;
    previous?.setState("redundant");
    next.setState("activating");
    for (const page of this.#pages) {
      if (!previous || page.controllerVersion !== previous) continue;
      const client = next.clients.get(page);
      if (client) client.controlled = true;
      page.controllerVersion = next;
      page.controllerChanged();
    }
    // As in the browser, a failed activate event still leaves the version active.
    await next.scope.activate().catch(() => {});
    next.setState("activated");
  }
}

type MessageListener = (event: ServiceWorkerMessageEventLike) => void;

/** A page of the in-memory browser. Its {@link InMemoryPage.container} is the page's `navigator.serviceWorker`. */
export class InMemoryPage {
  /** The page's `navigator.serviceWorker`. */
  readonly container: ServiceWorkerContainerLike;
  /** The page's `Notification`: the origin's permission, and the prompt that changes it. */
  readonly notifications: NotificationsLike;
  /** @internal */ controllerVersion: WorkerVersion | null = null;
  readonly #browser: InMemoryBrowser;
  readonly #messageListeners = new Set<MessageListener>();
  readonly #controllerListeners = new Set<() => void>();
  readonly #workers = new Map<WorkerVersion, ServiceWorkerLike>();
  readonly #registrations = new Map<Registration, ServiceWorkerRegistrationLike>();

  constructor(
    browser: InMemoryBrowser,
    readonly url: string,
  ) {
    this.#browser = browser;
    this.notifications = browser.permission;
    const page = this;
    this.container = {
      get controller() {
        return page.controllerVersion ? page.#worker(page.controllerVersion) : null;
      },
      register: async (scriptURL) => this.#registration(await browser.register(this, scriptURL)),
      addEventListener: (type: "message" | "controllerchange", listener: MessageListener | (() => void)) => {
        if (type === "message") this.#messageListeners.add(listener as MessageListener);
        else this.#controllerListeners.add(listener as () => void);
      },
      removeEventListener: (type: "message" | "controllerchange", listener: MessageListener | (() => void)) => {
        if (type === "message") this.#messageListeners.delete(listener as MessageListener);
        else this.#controllerListeners.delete(listener as () => void);
      },
    };
  }

  /** Every message the page's listeners received, oldest first. */
  readonly received: unknown[] = [];

  /** Closes the page, as closing its tab would. */
  close(): void {
    this.#browser.closed(this);
  }

  /** @internal Delivers a worker's message to the page in a later microtask, as a task of the page's event loop. */
  deliver(message: unknown): void {
    void this.#browser.track(
      Promise.resolve().then(() => {
        this.received.push(message);
        for (const listener of [...this.#messageListeners]) listener({ data: message });
      }),
    );
  }

  /** @internal */
  controllerChanged(): void {
    for (const listener of [...this.#controllerListeners]) listener();
  }

  #worker(version: WorkerVersion): ServiceWorkerLike {
    let worker = this.#workers.get(version);
    if (!worker) {
      const browser = this.#browser;
      const page = this;
      const listeners = new Map<() => void, () => void>();
      worker = {
        get state() {
          return version.state;
        },
        postMessage: (message) => browser.post(page, version, structuredClone(message)),
        addEventListener: (_type, listener) => {
          if (listeners.has(listener)) return;
          listeners.set(listener, listener);
          version.listeners.add(listener);
        },
        removeEventListener: (_type, listener) => {
          listeners.delete(listener);
          version.listeners.delete(listener);
        },
      };
      this.#workers.set(version, worker);
    }
    return worker;
  }

  #registration(registration: Registration): ServiceWorkerRegistrationLike {
    let view = this.#registrations.get(registration);
    if (!view) {
      const page = this;
      const browser = this.#browser;
      view = {
        ...(browser.pushSupported ? { pushManager: registration.push } : {}),
        get installing() {
          return registration.installing ? page.#worker(registration.installing) : null;
        },
        get waiting() {
          return registration.waiting ? page.#worker(registration.waiting) : null;
        },
        get active() {
          return registration.active ? page.#worker(registration.active) : null;
        },
        update: () => browser.update(registration),
      };
      this.#registrations.set(registration, view);
    }
    return view;
  }
}

/** Creates an in-memory browser. */
export function createBrowser(options?: InMemoryBrowserOptions): InMemoryBrowser {
  return new InMemoryBrowser(options);
}
