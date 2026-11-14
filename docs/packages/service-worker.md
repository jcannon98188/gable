# @gable/service-worker

Service worker support for Gable apps: offline caching, app-controlled updates, push and background sync. It is web-only, because a service worker is a browser feature. The design is in [ADR 0021](../adr/0021-service-worker-support-is-one-layered-package-and-web-only.md).

This package is being built. The entry points exist, and the pieces arrive with the TASK-106 tickets.

## Three entry points

- `@gable/service-worker/core` is the authoring API for writing a worker: routing, caching strategies, a versioned precache, lifecycle hooks, a typed message channel to the app, push and background sync.
- `@gable/service-worker/runtime` is the default worker. It is driven by `gable.sw.json` and built on core's public exports only. A test fails if it imports anything else from the package.
- `@gable/service-worker` is the app side: services for registration, an update-available signal and `activateUpdate()`. It registers only in production builds, so it never interferes with HMR.

## Available now

Core exports `WorkerScope` and the event, client and cache types that worker code runs against. They describe a real worker's `self`, and Gable can compile against them with the DOM lib, which cannot be combined with the WebWorker lib.

### Routing, caching strategies and the precache

Core routes fetch events to caching strategies and keeps a versioned precache:

```ts
import { cacheFirst, createFetchRouter, createPrecache, networkFirst, type WorkerScope } from "@gable/service-worker/core";

declare const self: WorkerScope;
const precache = createPrecache(self, { version: "3f9a1c", urls: ["/", "/assets/app.3f9a1c.js"] });
self.addEventListener("install", (event) => event.waitUntil(precache.install()));
self.addEventListener("activate", (event) => event.waitUntil(precache.activate()));

createFetchRouter(self)
  .route((url) => precache.has(url), precache.handler)
  .route("/api/*", networkFirst({ cacheName: "api", networkTimeoutMs: 3000 }))
  .route("/*", cacheFirst({ cacheName: "images" }), { destination: "image" })
  .listen();
```

- A fetch router tries routes in order and the first match answers. A route matches by URL pattern (a same-origin path such as `/users/:id` or `/assets/*`, an absolute URL pattern for another origin, a RegExp or a predicate), by method (GET unless given) and by request destination. Unmatched requests go to the network.
- The strategies are `cacheFirst`, `networkFirst` (with an optional network timeout), `staleWhileRevalidate` and `networkOnly`. The caching ones read and write one named cache and store only status 200 responses unless `cacheable` says otherwise; writes happen through the fetch event's `waitUntil`, so the page does not wait for them.
- A precache installs one release into its own cache, `gable-precache:<version>`. The version counts as installed only once every file is stored, so a failed or interrupted install is never served, and the running version keeps serving its own files while a new one installs. Activation removes the caches of other versions.

### Lifecycle hooks

`lifecycle(self, { version, install, activate, update })` runs typed hooks at a version's lifecycle steps and keeps the app informed:

```ts
import { lifecycle } from "@gable/service-worker/core";

lifecycle(self, {
  version: "3f9c2a",
  install: async () => {
    // all install work, precaching included: the app is told the version is ready only after this settles
  },
  activate: async () => {
    // clean up what earlier versions left
  },
  update: async ({ requestedBy }) => {
    // the app called activateUpdate(); runs before this waiting version takes over
  },
});
```

Updates are app-controlled. `lifecycle` never skips waiting on install, so a version that replaces another waits. It skips waiting only when the app sends the `activate-update` request. A hook that throws or rejects fails its step and sends the app an `error` message for that phase; a failed update hook leaves the version waiting.

### The worker-app message protocol

The messages between a worker and the app are public API. The app-side services rely on them, so they work with the default worker and with a custom worker built on `lifecycle` or on `createAppChannel`. Every message is a plain object whose `protocol` field is `SW_PROTOCOL` (`"gable-sw@1"`). A change to a message's shape is a breaking change and moves the protocol to `@2`; new message types and new optional fields are additive.

From the worker to every window client, controlled or not:

| `type` | Fields | Sent when |
| --- | --- | --- |
| `version-ready` | `version` | A version finished installing. If it replaces an earlier version it now waits for `activate-update`; a first version activates straight away. |
| `version-activated` | `version` | A version finished activating and controls the origin's pages. |
| `error` | `version`, `phase` (`install`, `activate`, `update` or `runtime`), `error: { name, message }` | A lifecycle hook failed, or worker code reported an error with `reportError`. |

From the app to a waiting worker:

| `type` | Fields | Effect |
| --- | --- | --- |
| `activate-update` | none | The worker runs its update hook, skips waiting, and sends `version-activated` once active. |

`isWorkerToAppMessage` and `isAppToWorkerMessage` check that a received value is a well-formed protocol message. `createAppChannel(self)` gives worker code the typed sending side (`broadcast`, `reportError`) and the app's requests (`onRequest`).

### Testing

The package's own unit tests run workers on an in-memory worker scope. It dispatches install, activate, fetch and message events, keeps Cache storage in memory, and has connected clients and a network that tests can replace. It is internal for now.
