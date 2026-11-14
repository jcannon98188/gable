// Shared by the services that call the registration's APIs, which need an active worker.
import type { ServiceWorkerRegistrationLike } from "./container.js";

/** Resolves once the registration has an active worker, which `pushManager.subscribe` and `sync.register` require, or its worker failed. */
export async function whenActive(registration: ServiceWorkerRegistrationLike): Promise<void> {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (!registration.active && worker.state !== "redundant") return;
      worker.removeEventListener("statechange", check);
      resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}
