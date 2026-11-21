// Registration of the app's service worker, and the stream of protocol messages its workers send (ADR 0022).
// It registers only in production builds, so a dev server's HMR never competes with a worker.
import { inject, InjectionToken, signal, type Provider, type ReadonlySignal } from "@gablejs/core";
import { currentScope, reportError } from "@gablejs/core/internal";
import { Subject, type Observable } from "rxjs";
import { isWorkerToAppMessage, type WorkerToAppMessage } from "../core/messages.js";
import type {
  NotificationsLike,
  ServiceWorkerContainerLike,
  ServiceWorkerMessageEventLike,
  ServiceWorkerRegistrationLike,
} from "./container.js";

/** Production builds define this as `false` (`@gablejs/vite` does on `vite build`), the same flag `@gablejs/core` uses. */
declare const __GABLE_DEV__: boolean | undefined;
const isProductionBuild = () => typeof __GABLE_DEV__ !== "undefined" && __GABLE_DEV__ === false;

/** Options for {@link provideServiceWorker}. */
export interface ServiceWorkerOptions {
  /** The URL of the worker script, such as `"/sw.js"`. */
  readonly url: string;
  /** The registration's scope: the URLs whose pages the worker controls. Defaults to the script's directory. */
  readonly scope?: string;
  /** `"module"` for a worker script that is an ES module. Defaults to `"classic"`. */
  readonly type?: WorkerType;
  /**
   * Whether to register the worker. Defaults to `true` in a production build and `false` in development, so the dev
   * server's HMR is never served stale code by a worker. Set it to keep a production build from registering too.
   */
  readonly enabled?: boolean;
}

/** The injection token that carries the {@link ServiceWorkerOptions}. Set it with {@link provideServiceWorker}. */
export const SERVICE_WORKER_OPTIONS = new InjectionToken<ServiceWorkerOptions>("ServiceWorkerOptions");

/**
 * The page's service worker API the services use. {@link provideServiceWorker} provides `navigator.serviceWorker`, or
 * `null` where the browser has none (the services then do nothing). Tests provide a fake after it.
 */
export const SERVICE_WORKER_CONTAINER = new InjectionToken<ServiceWorkerContainerLike | null>("ServiceWorkerContainer");

/**
 * The page's notification permission API that {@link SwPush} uses. {@link provideServiceWorker} provides the global
 * `Notification`, or `null` where the browser has none. Tests provide a fake after it.
 */
export const SERVICE_WORKER_NOTIFICATIONS = new InjectionToken<NotificationsLike | null>("ServiceWorkerNotifications");

/**
 * Providers that set up the app's service worker. Inject {@link SwUpdates} (or {@link SwRegistration}) once, in the
 * root component, to register it.
 *
 * @example
 * ```ts
 * bootstrap(Root, { renderer: dom(), providers: provideServiceWorker({ url: "/sw.js" }) });
 * ```
 */
export function provideServiceWorker(options: ServiceWorkerOptions): Provider[] {
  return [
    { provide: SERVICE_WORKER_OPTIONS, useValue: options },
    { provide: SERVICE_WORKER_CONTAINER, useFactory: defaultContainer },
    { provide: SERVICE_WORKER_NOTIFICATIONS, useFactory: defaultNotifications },
  ];
}

const defaultContainer = (): ServiceWorkerContainerLike | null =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;

const defaultNotifications = (): NotificationsLike | null => (typeof Notification !== "undefined" ? Notification : null);

/**
 * Registers the app's service worker when the service is created, in production builds only, and carries the
 * protocol messages its workers send. Most apps use {@link SwUpdates} and {@link SwPush}, which build on it.
 *
 * @example
 * ```ts
 * export class Root {
 *   static meta = { selector: "app-root", template: html`...` };
 *   sw = inject(SwRegistration); // registers the worker in a production build
 * }
 * ```
 */
export class SwRegistration {
  static scope = "root";

  readonly #options: ServiceWorkerOptions = requireOptions(inject(SERVICE_WORKER_OPTIONS, { optional: true }));
  readonly #registration = signal<ServiceWorkerRegistrationLike | null>(null);
  readonly #messages = new Subject<WorkerToAppMessage>();

  /** The page's service worker API, or `null` where the browser has none. */
  readonly container: ServiceWorkerContainerLike | null = inject(SERVICE_WORKER_CONTAINER, { optional: true });

  /** Whether this service registers the worker: `enabled` from the options, by default only in a production build. */
  readonly enabled: boolean = (this.#options.enabled ?? isProductionBuild()) && this.container !== null;

  /** The registration once the worker is registered; `null` before that, in development, or when registering failed. */
  readonly registration: ReadonlySignal<ServiceWorkerRegistrationLike | null> = this.#registration;

  /**
   * Every protocol message the origin's workers send this page, controlling or not. Other messages are left out.
   * Nothing is emitted when {@link SwRegistration.enabled} is false.
   */
  readonly messages: Observable<WorkerToAppMessage> = this.#messages.asObservable();

  /**
   * Settles once registering is done: with the registration, or with `null` when the service does not register (in
   * development, or without browser support) or registering failed. A failure goes to the app's ErrorHandler.
   */
  readonly ready: Promise<ServiceWorkerRegistrationLike | null> = this.#register();

  /** Whether a worker controls this page. A first visit's page is not controlled, even once its worker is active. */
  get controlled(): boolean {
    return this.container?.controller != null;
  }

  #register(): Promise<ServiceWorkerRegistrationLike | null> {
    const container = this.container;
    if (!this.enabled || !container) return Promise.resolve(null);
    const scope = currentScope();
    // Listen before registering, so no message of the first install is missed.
    const onMessage = (event: ServiceWorkerMessageEventLike) => {
      if (isWorkerToAppMessage(event.data)) this.#messages.next(event.data);
    };
    container.addEventListener("message", onMessage);
    container.startMessages?.();
    scope?.onDispose(() => {
      container.removeEventListener("message", onMessage);
      this.#messages.complete();
    });
    const { url, scope: registrationScope, type } = this.#options;
    const options: RegistrationOptions = {};
    if (registrationScope !== undefined) options.scope = registrationScope;
    if (type !== undefined) options.type = type;
    return container.register(url, options).then(
      (registration) => {
        this.#registration.set(registration);
        return registration;
      },
      (error: unknown) => {
        reportError(error, "setup", scope, "service worker registration");
        return null;
      },
    );
  }
}

function requireOptions(options: ServiceWorkerOptions | null): ServiceWorkerOptions {
  if (!options) throw new Error("SwRegistration needs the worker's URL: add provideServiceWorker({ url }) to the app's providers.");
  return options;
}
