# @gable/service-worker

Service worker support for Gable apps: offline caching, app-controlled updates, push and background sync. It is web-only, because a service worker is a browser feature. The design is in [ADR 0021](../adr/0021-service-worker-support-is-one-layered-package-and-web-only.md).

Most apps never write worker code. They describe what to cache in `gable.sw.json`, add one Vite plugin, and use two services in the app. Apps that need more can extend the default worker, or replace it with one written against the authoring API.

## Get started

A new app: pass `--service-worker` to [create-gable](./create-gable.md).

```
npm create gable@latest my-app -- --service-worker
```

The starter then has everything below, plus an update banner. [Getting started](../getting-started.md#offline-and-updates-the-service-worker-option) lists its files.

An existing app takes four steps:

1. Install the package next to `@gable/vite`: `npm install @gable/service-worker`.
2. Add [`gableServiceWorker()`](./vite.md#gableserviceworker) to `vite.config.ts`: `plugins: [gable(), gableServiceWorker()]`.
3. Write `gable.sw.json` in the project root (see [The default worker](#the-default-worker-gableswjson)). This one caches the whole app and serves it offline:

   ```json
   {
     "assetGroups": [{ "name": "app", "files": ["/index.html", "/assets/**"] }],
     "navigationFallback": { "url": "/index.html" }
   }
   ```

4. Register the worker and handle updates in the app:

   ```ts
   import { provideServiceWorker } from "@gable/service-worker";

   bootstrap(Root, { renderer: dom(), target: "#app", providers: provideServiceWorker({ url: "/sw.js" }) });
   ```

   Then inject `SwUpdates` in a component that is always on screen (see [App-side services](#app-side-services)). Injecting it registers the worker.

The worker exists only in a production build. Try it with `vite build` and `vite preview`; the dev server has no worker, so HMR is never served stale code.

## Three layers

The package has three entry points, one per layer:

| Entry point | Layer | Who uses it |
| --- | --- | --- |
| `@gable/service-worker` | The app side: `provideServiceWorker`, `SwUpdates`, `SwPush`, `SwRegistration`. | Every app with a worker. |
| `@gable/service-worker/runtime` | The default worker, driven by `gable.sw.json`, with `extend` for additions. | The worker file `gableServiceWorker()` generates; apps that extend it. |
| `@gable/service-worker/core` | The authoring API: routing, caching strategies, a versioned precache, lifecycle hooks, the message protocol, push and background sync. | Custom workers, and extensions of the default one. |

The runtime is built on core's public exports only; a test fails if it imports anything else from the package. The app side never imports the runtime, so an app's bundle carries no worker code. The app side talks to workers only through the [message protocol](#the-worker-app-message-protocol), so it works the same with the default worker, an extended one and one written from scratch.

## Releases and updates

Every production build is a release. `gableServiceWorker()` emits `sw-manifest.json`, which lists every file the build emitted with its content hash, and builds the manifest into `sw.js`. Its `version` hashes the worker's code and every file hash, so a change to any file, to `gable.sw.json` or to the worker makes a new release, and a build with no change keeps its version.

- **Install.** A release downloads its files into its own cache, `gable-precache:<version>`. It counts as installed only once every file is stored; a failed or interrupted install is never served and fails the worker's install.
- **First visit.** The first release activates straight away, but the page that registered it is not controlled until its next load. From then on the worker serves the app, offline included.
- **Update.** The browser finds a new `sw.js` when a page loads, or when the app calls `checkForUpdate()`. The new release installs in the background while the running one keeps serving its own files, then waits. `SwUpdates.updateAvailable` turns true.
- **Activate.** Only the app decides when the new release takes over, by calling `activateUpdate()`. It resolves once the new release is in charge, and the app reloads into the new code. Activation removes the older releases' caches.

Updates are app-controlled because a release that took over on its own could replace code under a page that holds unsaved state.

## The default worker: gable.sw.json

`gable.sw.json` says what to cache. It has three parts:

```json
{
  "assetGroups": [
    { "name": "app", "installMode": "prefetch", "files": ["/index.html", "/assets/**"] },
    { "name": "images", "installMode": "lazy", "files": ["/images/**"] }
  ],
  "dataGroups": [
    { "name": "api", "urls": ["/api/**"], "strategy": "freshness", "timeoutMs": 3000 },
    { "name": "avatars", "urls": ["https://cdn.example/avatars/**"], "strategy": "performance" }
  ],
  "navigationFallback": { "url": "/index.html", "exclude": ["/api/**", "/**/*.*"] }
}
```

- **Patterns** are globs over URL paths: `*` matches within one segment and `**` matches any number of segments. Absolute patterns (`https://...`) are allowed in data groups. The query string is not part of the path.
- **Asset groups** pick files from the build's manifest; a file belongs to the first group that matches it. `prefetch` files (the default) are downloaded while the release installs, and the release is ready only once all of them are stored. `lazy` files are cached the first time they are requested. Both caches belong to the release (`gable-precache:<version>` and `gable-lazy:<version>`) and are removed when a later release activates. A request matches a file only by its exact URL.
- **Data groups** cache requests at runtime, GET only, in `gable-data:<name>`, which outlives releases. `freshness` goes to the network first and falls back to the cache when the network fails or is slower than `timeoutMs`. `performance` answers from the cache and refreshes it in the background. Activation removes the caches of data groups the config no longer has.
- **The navigation fallback** answers page navigations (GET, same origin) with the precached shell, so client-side routes load offline. `exclude` lists navigations to leave to the network; it defaults to `["/**/*.*"]`, paths that look like files, and replaces that default when set. The shell must be a file of a prefetch group.

Requests are answered by the first match, in this order: extension routes, precached files, lazy files, the navigation fallback, data groups. Anything else goes to the network.

Pushes and notification clicks are handled too. A push whose JSON payload has a `notification` object with a `title` is shown, its other fields used as notification options; a click on a notification whose `data.url` is a string opens that URL. Both are forwarded to `SwPush`.

The build checks `gable.sw.json`: `validateConfig` reports every problem with its JSON path in one `ServiceWorkerConfigError` (unknown settings are errors too), and `validateManifest(config, manifest)` checks that the shell is prefetched. With the default worker, `vite build` fails with that error. A `defineWorker()` worker of your own (see below) runs the same checks when the worker starts.

## Extend the default worker

Point `gableServiceWorker({ entry: "src/sw.ts" })` at a module whose default export is a `defineWorker()` result, and add to the declarative behaviour with `extend`:

```ts
// src/sw.ts
import { backgroundSync, networkOnly } from "@gable/service-worker/core";
import { defineWorker } from "@gable/service-worker/runtime";
import config from "../gable.sw.json";

export default defineWorker({
  config,
  extend: ({ self, version, router }) => {
    router.route("/api/live/*", networkOnly()); // tried before the declarative routes
    backgroundSync(self, { tag: "outbox", version, sync: () => sendQueuedMessages() });
    return {
      install: () => migrateDatabase(), // runs after the precache, before the app hears version-ready
      push: ({ data, showNotification }) => showNotification(`New: ${(data as { title: string }).title}`),
    };
  },
});
```

The extension gets the scope, version, config, manifest, router and precache. Its routes are tried before the declarative ones, and it can use any core handler. It can return `install`, `activate` and `update` hooks, which run after the worker's own work in the same lifecycle step, and `push` and `notificationClick` handlers, which replace the defaults. Forwarding to the app stays either way. A hook that fails is reported to the app as `lifecycle()` reports it.

## Replace the default worker

A custom worker is a module whose default export is a function `(self, manifest) => void`. `gableServiceWorker({ entry })` bundles it into `sw.js` and calls it with the worker's `self` and the same manifest the default worker gets, so a worker written against core alone keeps atomic, versioned releases:

```ts
// src/sw.ts
import { createFetchRouter, createPrecache, lifecycle, type WorkerScope } from "@gable/service-worker/core";
import type { AssetManifest } from "@gable/service-worker/runtime";

export default function worker(self: WorkerScope, manifest: AssetManifest): void {
  const precache = createPrecache(self, { version: manifest.version, urls: manifest.files });
  lifecycle(self, { version: manifest.version, install: () => precache.install(), activate: () => precache.activate() });
  createFetchRouter(self).route((url) => precache.has(url), precache.handler).listen();
}
```

The app-side services work with it unchanged, as long as it keeps the [protocol](#the-worker-app-message-protocol): send `version-ready` after it installs and `version-activated` after it activates, and answer `activate-update` by calling `skipWaiting()`. `lifecycle()` does all three. The rest of this section is core's API.

`WorkerScope` and the event, client and cache types describe a real worker's `self`. Gable compiles against them with the DOM lib, which cannot be combined with the WebWorker lib.

### Routing, caching strategies and the precache

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

- A fetch router tries routes in order and the first match answers. A route matches by URL pattern (a same-origin path such as `/users/:id` or `/assets/*`, an absolute URL pattern for another origin, a RegExp or a predicate), by method (GET unless given) and by request destination. Unmatched requests go to the network. A handler that throws is a network error, not a fall-through.
- The strategies are `cacheFirst`, `networkFirst` (with an optional network timeout), `staleWhileRevalidate` and `networkOnly`. The caching ones read and write one named cache and store only status 200 responses unless `cacheable` says otherwise; writes happen through the fetch event's `waitUntil`, so the page does not wait for them.
- A precache installs one release into its own cache, `gable-precache:<version>`. The version counts as installed only once every file is stored, so a failed or interrupted install is never served, and the running version keeps serving its own files while a new one installs. Its requests revalidate with the server (`cache: "no-cache"`), so the HTTP cache cannot hand it an older release's file. Activation removes the caches of other versions.

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

`lifecycle` never skips waiting on install, so a version that replaces another waits. It skips waiting only when the app sends the `activate-update` request. A hook that throws or rejects fails its step and sends the app an `error` message for that phase; a failed update hook leaves the version waiting.

### The worker-app message protocol

The messages between a worker and the app are public API. Every message is a plain object whose `protocol` field is `SW_PROTOCOL` (`"gable-sw@1"`). A change to a message's shape is a breaking change and moves the protocol to `@2`; new message types and new optional fields are additive.

From the worker to every window client, controlled or not:

| `type` | Fields | Sent when |
| --- | --- | --- |
| `version-ready` | `version` | A version finished installing. If it replaces an earlier version it now waits for `activate-update`; a first version activates straight away. |
| `version-activated` | `version` | A version finished activating and controls the origin's pages. |
| `error` | `version`, `phase` (`install`, `activate`, `update` or `runtime`), `error: { name, message }` | A lifecycle hook failed, or worker code reported an error with `reportError`. |
| `push` | `version`, `data` (parsed JSON, text, or `null`) | The worker received a push message. |
| `notification-click` | `version`, `action` (`""` for the notification itself), `notification: { title, body, tag, data }` | The user clicked a notification the worker showed. |

From the app to a waiting worker:

| `type` | Fields | Effect |
| --- | --- | --- |
| `activate-update` | none | The worker runs its update hook, skips waiting, and sends `version-activated` once active. |

`isWorkerToAppMessage` and `isAppToWorkerMessage` check that a received value is a well-formed protocol message. `createAppChannel(self)` gives worker code the typed sending side (`broadcast`, `reportError`) and the app's requests (`onRequest`), for a worker that does not use `lifecycle`.

### Push and notification clicks

`onPush` and `onNotificationClick` handle the worker's push and notification-click events with typed handlers. Each also forwards its event to the app's open pages with the protocol's `push` or `notification-click` message, which `SwPush` exposes:

```ts
import { onNotificationClick, onPush } from "@gable/service-worker/core";

onPush(self, {
  version: "3f9c2a",
  handle: ({ data, showNotification }) => {
    const mail = data as { id: number; subject: string };
    return showNotification("New mail", { body: mail.subject, tag: "mail", data: { id: mail.id } });
  },
});

onNotificationClick(self, {
  version: "3f9c2a",
  handle: ({ action, notification, openWindow }) => {
    if (action === "") return openWindow(`/mail/${(notification.data as { id: number }).id}`);
  },
});
```

- The push handler gets the payload decoded as the `push` message carries it: parsed JSON, else text, else `null`. The raw payload is there as `message`. A notification shown through the context's `showNotification` keeps the push event alive until it is shown. Chromium shows its own notice when a push shows no notification.
- A click closes the notification unless `keepOpen` is set, since not every platform closes it by itself. The handler gets the clicked `action` (`""` for the notification itself) and `openWindow`, which browsers allow only while a click is being handled.
- `forward: false` keeps an event from the app. A handler that throws or rejects fails its event and sends the app an `error` message with phase `runtime`. Each function returns a disposer.

### Background sync

`backgroundSync(self, { tag, version, sync })` registers one tag and handles its sync events:

```ts
import { backgroundSync } from "@gable/service-worker/core";

const outbox = backgroundSync(self, { tag: "outbox", version: "3f9c2a", sync: () => sendQueuedMessages() });

// after a send failed offline:
await outbox.register(); // false in a browser without background sync
```

- `register()` resolves `true` once the browser has the tag. It resolves `false` where background sync is missing (at the time of writing, everywhere but Chromium-based browsers), and the worker then has to retry by other means. `supported` and `isRegistered()` report the same state.
- The handler runs only for its own tag, with `lastChance`. A rejected attempt fails the sync event so the browser retries it later. Only a failed last chance is reported to the app, as an `error` message with phase `runtime`.

## App-side services

`provideServiceWorker({ url })` sets the app up; injecting one of the services registers the worker. Registration happens only in a production build (`@gable/vite` defines `__GABLE_DEV__` as `false` on `vite build`). In development the services do nothing, so the dev server's HMR is never served stale code. Set `enabled` to override that either way. `scope` and `type` pass through to `navigator.serviceWorker.register`; `sw.js` from `gableServiceWorker()` is a classic script, so leave `type` unset for it.

```ts
import { provideServiceWorker } from "@gable/service-worker";

bootstrap(Root, { renderer: dom(), target: "#app", providers: provideServiceWorker({ url: "/sw.js" }) });
```

- `SwUpdates`: `updateAvailable` is a signal that turns true when a new version has installed and waits. `checkForUpdate()` asks the browser to look for a new worker script and resolves with whether a version is now waiting; it rejects when the script cannot be fetched, such as offline. `activateUpdate()` has the waiting version take over and resolves with `true` once it has, so the app can reload. It rejects with the worker's error when the worker's update hook fails. `versions` is an Observable of `version-ready` and `version-activated` events. A page that no worker controls (a first visit) never sees `updateAvailable` turn true, because it already runs the newest code.
- `SwPush`: `messages` emits each push payload, and `notificationClicks` emits `{ action, notification }` for each click. The worker forwards both with the `push` and `notification-click` messages.
- `SwRegistration`: the registration itself (`registration`, a signal, and `ready`, a promise) and the raw stream of protocol messages. A failed registration goes to the app's `ErrorHandler`.

The create-gable starter's banner:

```ts
export class UpdateBanner {
  static meta = {
    selector: "app-update-banner",
    template: html`
      @if (available()) {
        <p>A new version is ready. <button (click)="update()">Reload</button></p>
      }
    `,
  };

  updates = inject(SwUpdates);
  available = this.updates.updateAvailable;

  async update() {
    if (await this.updates.activateUpdate()) location.reload();
  }
}
```

The services read workers only through the protocol, plus the registration's standard `installing` and `waiting` slots.

## The Vite plugin

[`gableServiceWorker()`](./vite.md#gableserviceworker) from `@gable/vite` runs in `vite build` only and emits two files into the output directory:

- `sw-manifest.json`, the asset manifest `{ version, files, hashes }`: every emitted file (the public directory's included, source maps left out) as a path from the origin's root, each file's content hash, and the release version.
- `sw.js`, the worker: one classic script with the manifest built in, at a fixed URL so the browser sees each release as an update. Register it with `provideServiceWorker({ url: "/sw.js" })`, with `base` prefixed when it is not `/`.

Its options are `config` (default `"gable.sw.json"`), `entry` (a custom worker module in place of the default worker, for the extend and replace paths), `fileName` and `manifestFileName`. `@gable/service-worker` is an optional peer of `@gable/vite`, and `gable()` is unchanged, so apps without the plugin pay nothing. The runtime's `AssetManifest` type is `{ version, files }`; the emitted manifest adds `hashes`, typed as `EmittedAssetManifest` in `@gable/vite`.

## Testing

The package's unit tests run workers on an in-memory worker scope. It dispatches install, activate, fetch, message, push, notification-click and sync events, keeps Cache storage and shown notifications in memory, and has connected clients and a network that tests can replace. An in-memory browser on top of it plays `navigator.serviceWorker` for any number of pages, so the app-side services are tested against real worker code, the default worker included. Both are internal for now.

The create-gable starter with `--service-worker` is also tested end to end in headless Chromium: a production build installs, keeps working with the server down, and takes a new release through the banner's `activateUpdate()`.

## Limits

What v1 does not do, as of this release:

- **Web only.** Gable Native has no service worker host; offline support there is a separate decision.
- **Production builds only.** The dev server has no worker. Test worker behaviour with `vite build` and `vite preview`.
- **First visit.** The worker does not claim the page that first registers it (`clients.claim()`), so it serves the app from that page's next load.
- **No carry-over between releases.** Each release downloads all its prefetch and lazy files again, even unchanged ones; the manifest has per-file hashes, but the runtime does not use them yet.
- **Caching.** No maximum age or size for data caches. Asset groups cannot list files on other origins (a `performance` data group covers them). Precached files match by exact URL, with no ignore-search or directory-index matching beyond the navigation fallback. The precache does not reject redirected responses, so serve build files directly.
- **Push.** Push subscription (`pushManager.subscribe`) is not wrapped, `notificationclose` and periodic background sync are not handled, and a notification click opens a new window rather than focusing an open one.
- **Background sync** works only where the browser has it (Chromium-based browsers); elsewhere `register()` resolves `false` and there is no built-in fallback.
- **Versions.** The app learns versions from `version-ready` and `version-activated` events; there is no request for the running version on page load.
- **Vite plugin.** `base` must be an absolute path (no CDN or relative `base`). `gableI18n()`'s baked per-locale outputs are not covered; the worker describes the top-level build only. Your own Vite plugins are not applied to the worker bundle; it inherits only `resolve.alias`, `define`, `mode`, `minify` and the build `target`.
- **Config.** There is no JSON schema for `gable.sw.json` yet; a `$schema` key is accepted and ignored.
- **Tooling.** The in-memory worker scope and browser are not exported for app tests, and the devtools extension does not show worker versions or cache state.

Every exported symbol is documented in the [API reference](/docs/service-worker/api).
