# Service worker support is one layered package and is web-only

Gable ships service worker support as a single package, `@gable/service-worker`, with three layers on separate subpath exports. The layers are the authoring API, a default worker built on it, and the app-side services.

- `@gable/service-worker/core` is the authoring API for writing a worker. It has request routing, caching strategies (cache-first, network-first, stale-while-revalidate, network-only), a versioned precache that installs and activates atomically, lifecycle hooks, a typed message channel to the app, and push and background sync handlers.
- `@gable/service-worker/runtime` is the default worker. It reads `gable.sw.json` (asset groups, data groups, navigation fallback) and wires the core primitives. Most apps never open it. It uses only core's public surface, so a primitive the runtime needs that core does not export is a gap in core.
- `@gable/service-worker` is the app side: injectable services for registration, an update-available signal, `checkForUpdate()`, `activateUpdate()`, Observables for version, push and notification-click events. It registers only in production builds, so it never competes with HMR.

The Angular-style declarative worker is the default. Going further means either extending it (`defineWorker({ config, extend })` adds routes and handlers to the declarative behaviour) or replacing it with a worker written against core alone. The Vite plugin emits the hashed asset manifest in both cases, so a hand-written worker keeps atomic versioned updates.

Updates are app-controlled. A new version installs in the background and the app is told through the update-available signal; it activates only when the app calls `activateUpdate()`. The message protocol between worker and app is part of the package's contract, so the app-side services work with the default worker and with a custom one.

v1 covers precache, runtime caching, navigation fallback, push and background sync.

The package is web-only. A service worker is a browser feature: the browser hosts it, it intercepts requests for an origin, and it owns the lifecycle and storage. Gable Native has no such host. Offline behaviour and background work there are a separate decision with their own worker story; nothing in this package's core API is shaped around Native.

## Alternatives rejected

Declarative worker only. It is the right default but gives no route to custom routing, background sync or unusual caching strategies other than leaving the package.

Authoring API only, in the style of Workbox. It leaves every app to reassemble the hard parts (atomic updates, navigation fallback) and gives Gable no integration beyond typing.

Separate packages for core, runtime and app side. More versioning to coordinate for no extra isolation; subpath exports keep the boundary, and a lint or test on the runtime's imports can enforce it.

Letting a new version activate on next load. It is simpler but gives the app no say in when users get new code, which matters for apps holding unsaved state.

## Consequences

Dev mode has no worker, so HMR is unaffected. Worker behaviour is tested in production builds and with an in-memory worker scope in unit tests.

`@gable/vite` gains a build-time step to emit the manifest and worker file. It still needs no compiler awareness of Gable's templates.

Devtools support for worker version and cache state is deferred.
