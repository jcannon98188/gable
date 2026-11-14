// Typed install, activate and update hooks for a worker version, which also speak the app protocol (messages.ts):
// version-ready after install, version-activated after activate, an error event when a hook fails, and
// app-controlled activation through the activate-update request (ADR 0021).
import { createAppChannel, SW_PROTOCOL, type WorkerErrorPhase } from "./messages.js";
import type { WorkerClient, WorkerExtendableEvent, WorkerScope } from "./scope.js";

/** What every lifecycle hook is told. */
export interface LifecycleContext {
  /** The worker's version, as passed to {@link lifecycle}. */
  readonly version: string;
}

/** What the install hook is told. */
export type InstallContext = LifecycleContext;

/** What the activate hook is told. */
export type ActivateContext = LifecycleContext;

/** What the update hook is told. */
export interface UpdateContext extends LifecycleContext {
  /** The client whose app asked for the update, or `null` when the request did not come from a client. */
  readonly requestedBy: WorkerClient | null;
}

/** A lifecycle hook. A returned promise keeps the step going until it settles; a rejection, or a throw, fails the step. */
export type LifecycleHook<Context> = (context: Context) => void | Promise<void>;

/** Options for {@link lifecycle}. */
export interface LifecycleOptions {
  /** The worker's version, sent to the app in every protocol message. A build hash is a good choice. */
  readonly version: string;
  /**
   * Runs while the version installs, before the app is told it is ready. Put all install work here, precaching
   * included, so that `version-ready` means the version is complete.
   */
  readonly install?: LifecycleHook<InstallContext>;
  /** Runs while the version activates, before the app is told it is active. Clean up what earlier versions left here. */
  readonly activate?: LifecycleHook<ActivateContext>;
  /**
   * Runs when the app asks this waiting version to take over (`activateUpdate()`), before the worker skips waiting.
   * If it fails, the version keeps waiting.
   */
  readonly update?: LifecycleHook<UpdateContext>;
}

/**
 * Runs the hooks in `options` at the worker's lifecycle steps and keeps the app informed through the message protocol:
 *
 * - install: runs `install`, then broadcasts `version-ready`. It never skips waiting, because updates are
 *   app-controlled: a version that replaces another waits for the app.
 * - activate: runs `activate`, then broadcasts `version-activated`.
 * - an `activate-update` request from the app: runs `update`, then calls `skipWaiting()`.
 *
 * A hook that fails broadcasts an `error` message for its phase and fails its step. Returns a function that removes
 * every hook.
 */
export function lifecycle(self: WorkerScope, options: LifecycleOptions): () => void {
  const { version } = options;
  const channel = createAppChannel(self);

  const run = async (phase: WorkerErrorPhase, step: () => void | Promise<void>, after: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      await channel.reportError(version, phase, error);
      throw error;
    }
    await after();
  };

  const onInstall = (event: WorkerExtendableEvent) =>
    event.waitUntil(
      run("install", () => options.install?.({ version }), () => channel.broadcast({ protocol: SW_PROTOCOL, type: "version-ready", version })),
    );
  const onActivate = (event: WorkerExtendableEvent) =>
    event.waitUntil(
      run(
        "activate",
        () => options.activate?.({ version }),
        () => channel.broadcast({ protocol: SW_PROTOCOL, type: "version-activated", version }),
      ),
    );
  self.addEventListener("install", onInstall);
  self.addEventListener("activate", onActivate);
  const stopRequests = channel.onRequest((request, event) => {
    if (request.type !== "activate-update") return;
    return run("update", () => options.update?.({ version, requestedBy: event.source }), () => self.skipWaiting());
  });

  return () => {
    self.removeEventListener("install", onInstall);
    self.removeEventListener("activate", onActivate);
    stopRequests();
  };
}
