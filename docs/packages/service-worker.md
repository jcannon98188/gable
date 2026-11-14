# @gable/service-worker

Service worker support for Gable apps: offline caching, app-controlled updates, push and background sync. It is web-only, because a service worker is a browser feature. The design is in [ADR 0021](../adr/0021-service-worker-support-is-one-layered-package-and-web-only.md).

This package is being built. The entry points exist, and the pieces arrive with the TASK-106 tickets.

## Three entry points

- `@gable/service-worker/core` is the authoring API for writing a worker: routing, caching strategies, a versioned precache, lifecycle hooks, a typed message channel to the app, push and background sync.
- `@gable/service-worker/runtime` is the default worker. It is driven by `gable.sw.json` and built on core's public exports only. A test fails if it imports anything else from the package.
- `@gable/service-worker` is the app side: services for registration, an update-available signal and `activateUpdate()`. It registers only in production builds, so it never interferes with HMR.

## Available now

Core exports `WorkerScope` and the event, client and cache types that worker code runs against. They describe a real worker's `self`, and Gable can compile against them with the DOM lib, which cannot be combined with the WebWorker lib.

Core also has routing, caching strategies and a versioned precache:

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

The package's own unit tests run workers on an in-memory worker scope. It dispatches install, activate and fetch events, keeps Cache storage in memory, and has connected clients and a network that tests can replace. It is internal for now.
