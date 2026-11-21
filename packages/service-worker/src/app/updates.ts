// App-controlled updates (ADR 0022): a new version installs in the background, the app is told through a signal, and
// it takes over only when the app calls activateUpdate(). Everything here reads the worker through the message
// protocol, plus the registration's standard waiting and installing slots, so it works with any worker built on core.
import { inject, signal, type ReadonlySignal } from "@gablejs/core";
import { currentScope } from "@gablejs/core/internal";
import { filter, type Observable, type Subscription } from "rxjs";
import {
  SW_PROTOCOL,
  type ActivateUpdateRequest,
  type VersionActivatedMessage,
  type VersionReadyMessage,
  type WorkerErrorInfo,
  type WorkerToAppMessage,
} from "../core/messages.js";
import type { ServiceWorkerLike, ServiceWorkerRegistrationLike } from "./container.js";
import { SwRegistration } from "./registration.js";

/** A version event from the worker: a version finished installing, or finished activating. */
export type VersionEvent = VersionReadyMessage | VersionActivatedMessage;

const isVersionEvent = (message: WorkerToAppMessage): message is VersionEvent =>
  message.type === "version-ready" || message.type === "version-activated";

/** An error from the worker as an Error the app can throw: the name and message it reported. */
const toError = (info: WorkerErrorInfo): Error => Object.assign(new Error(info.message), { name: info.name });

/**
 * How long {@link SwUpdates.checkForUpdate} waits, once the new version has installed, for its `version-ready` message
 * before it answers from the registration's waiting slot instead.
 */
const VERSION_READY_GRACE_MS = 1000;

/** Calls `listener` on each state change of `worker` until the returned function is called. */
function onStateChange(worker: ServiceWorkerLike, listener: (state: string) => void): () => void {
  const onChange = () => listener(worker.state);
  worker.addEventListener("statechange", onChange);
  return () => worker.removeEventListener("statechange", onChange);
}

/** The waiting worker, once a version that is still installing has finished (or failed) installing. */
function waitingWorker(registration: ServiceWorkerRegistrationLike): Promise<ServiceWorkerLike | null> {
  const installing = registration.installing;
  if (registration.waiting || !installing) return Promise.resolve(registration.waiting);
  return new Promise((resolve) => {
    const stop = onStateChange(installing, (state) => {
      if (state === "installing") return;
      stop();
      resolve(registration.waiting);
    });
  });
}

/**
 * App-controlled updates. A new version of the worker installs in the background; {@link SwUpdates.updateAvailable}
 * turns true, and the new version takes over only when the app calls {@link SwUpdates.activateUpdate}. Injecting it
 * registers the worker (through {@link SwRegistration}), in production builds only.
 *
 * @example
 * ```ts
 * export class UpdateBanner {
 *   static meta = {
 *     selector: "app-update-banner",
 *     template: html`<button ?hidden=${() => !this.updates.updateAvailable()} @click=${() => this.reload()}>Update</button>`,
 *   };
 *
 *   updates = inject(SwUpdates);
 *
 *   async reload() {
 *     if (await this.updates.activateUpdate()) location.reload();
 *   }
 * }
 * ```
 */
export class SwUpdates {
  static scope = "root";

  readonly #sw = inject(SwRegistration);
  readonly #available = signal(false);

  /**
   * Whether a new version has installed and waits for {@link SwUpdates.activateUpdate}. It stays false on a page no
   * worker controls (a first visit), since that page already runs the newest code.
   */
  readonly updateAvailable: ReadonlySignal<boolean> = this.#available;

  /**
   * The worker's version events, for every page of the origin: `version-ready` when a version has installed and
   * `version-activated` when one has taken over. A first visit sees both for the first version.
   */
  readonly versions: Observable<VersionEvent> = this.#sw.messages.pipe(filter(isVersionEvent));

  // Gable classes have no constructors (the injector rejects them), so the service starts watching the worker's
  // version events from this field initialiser. The field holds the subscription, which ends with the service's scope.
  readonly #versionWatch: Subscription = this.#watchVersions();

  /** Keeps {@link SwUpdates.updateAvailable} in step with the worker's version events, until the scope is disposed. */
  #watchVersions(): Subscription {
    const subscription = this.#sw.messages.subscribe((message) => {
      if (message.type === "version-ready") this.#available.set(this.#sw.controlled);
      else if (message.type === "version-activated") this.#refresh();
    });
    currentScope()?.onDispose(() => this.#versionWatch.unsubscribe());
    // A page opened while a version already waits learns of it once registered.
    void this.#sw.ready.then(() => this.#refresh());
    return subscription;
  }

  /**
   * Asks the browser to fetch the worker script and install it if it changed. Resolves with whether a new version is
   * now ready for {@link SwUpdates.activateUpdate}; false when nothing changed, the new version failed to install, or
   * the service does not register (development builds). Rejects when the script cannot be fetched, such as offline.
   *
   * It answers as soon as the new version reports `version-ready`, or turns redundant. A version that installs without
   * sending `version-ready` (a custom worker that does not speak the protocol, or a lost message) is answered for by
   * the registration about a second after it reaches `installed`: true when it waits and a worker controls this
   * page, which also raises {@link SwUpdates.updateAvailable}. So the promise always settles once the browser has
   * finished installing.
   */
  async checkForUpdate(): Promise<boolean> {
    const registration = await this.#sw.ready;
    if (!registration) return false;
    return new Promise<boolean>((resolve, reject) => {
      const stops: (() => void)[] = [];
      let settled = false;
      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        for (const stop of stops) stop();
        outcome();
      };
      const subscription = this.#sw.messages.subscribe((message) => {
        if (message.type === "version-ready") finish(() => resolve(this.#sw.controlled));
      });
      stops.push(() => subscription.unsubscribe());
      // Once installed, the version's own version-ready message is the answer, but the page may see the state change
      // first, and a custom worker need not send the message at all: after a short grace the registration decides.
      let graceStarted = false;
      const onInstallingState = (state: string) => {
        // A failed install makes the version redundant, whether or not the worker reported an error.
        if (state === "redundant") return finish(() => resolve(false));
        if (state === "installing" || graceStarted) return;
        graceStarted = true;
        const timer = setTimeout(() => finish(() => resolve(this.#refresh())), VERSION_READY_GRACE_MS);
        stops.push(() => clearTimeout(timer));
      };
      registration.update().then(
        () => {
          if (settled) return; // version-ready arrived first: nothing left to watch
          const installing = registration.installing;
          if (!installing) return finish(() => resolve(this.#refresh()));
          stops.push(onStateChange(installing, onInstallingState));
          onInstallingState(installing.state);
        },
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  /**
   * Has the waiting version take over. Resolves with true once it has activated, so the app can reload into the new
   * code; false when no version waits (or the service does not register). Rejects with the worker's error when its
   * update step fails, and the version keeps waiting.
   */
  async activateUpdate(): Promise<boolean> {
    const registration = await this.#sw.ready;
    if (!registration) return false;
    const waiting = await waitingWorker(registration);
    if (!waiting) return false;
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        subscription.unsubscribe();
        stopState();
        this.#refresh();
        outcome();
      };
      const subscription = this.#sw.messages.subscribe((message) => {
        if (message.type === "version-activated") finish(() => resolve(true));
        else if (message.type === "error" && message.phase === "update") finish(() => reject(toError(message.error)));
      });
      const stopState = onStateChange(waiting, (state) => {
        if (state === "activated") finish(() => resolve(true));
        else if (state === "redundant") finish(() => resolve(false)); // replaced by a newer version before it took over
      });
      const request: ActivateUpdateRequest = { protocol: SW_PROTOCOL, type: "activate-update" };
      waiting.postMessage(request);
    });
  }

  /** Sets {@link SwUpdates.updateAvailable} from the registration: a version waits and a worker controls this page. */
  #refresh(): boolean {
    const available = this.#sw.registration()?.waiting != null && this.#sw.controlled;
    this.#available.set(available);
    return available;
  }
}
