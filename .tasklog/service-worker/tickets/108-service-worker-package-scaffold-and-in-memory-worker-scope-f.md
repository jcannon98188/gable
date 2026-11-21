---
kind: ticket
title: Service worker package scaffold and in-memory worker scope for tests
status: resolved
tags:
  - parent-106
created: 2026-11-13
updated: 2026-11-14
imported_from: backlog/tasks/task-106.1 - Service-worker-package-scaffold-and-in-memory-worker-scope-for-tests.md
assignee:
  - '@claude'
ordinal: 262000
---

## Question

Every later layer needs a package to live in and a way to test worker code without a browser. This sets up @gablejs/service-worker with the core, runtime and root subpath exports, and a fake worker scope (fetch events, Cache storage, clients, lifecycle events) used by unit tests.

## Acceptance criteria

- [x] #1 Package builds with exports for the root, core and runtime subpaths
- [x] #2 An in-memory worker scope can dispatch install, activate and fetch events and back caches
- [x] #3 A test enforces that runtime imports only core public exports

## Implementation plan

1. Scaffold packages/service-worker (package.json exports ., ./core, ./runtime; tsconfig.json + tsconfig.build.json like packages/store). Entry points src/index.ts (app side, stub), src/core/index.ts, src/runtime/index.ts (stub).
2. core exports structural worker types (WorkerScope, WorkerExtendableEvent, WorkerFetchEvent, WorkerClients, WorkerClient) so worker code type-checks under the repo's DOM lib (DOM and WebWorker libs conflict) and both the real self and the in-memory scope satisfy them.
3. Test-first: in-memory worker scope at src/testing/worker-scope.ts (internal, not exported, excluded from the build): createWorkerScope() with install()/activate()/fetch dispatch (waitUntil, respondWith, network fallback, lifecycle state), in-memory CacheStorage/Cache, clients (connect, matchAll, get, claim, postMessage log), skipWaiting, pluggable network. Must run in the engine-suites harness too (no Node built-ins, no Request.clone).
4. Test-first: runtime import boundary test (Node fs, own file): every non-test import in src/runtime resolves inside runtime/ or to core's public entry (relative ../core/index.js or @gablejs/service-worker/core); checker tested on synthetic sources too.
5. Register: vitest.config.ts aliases, tsconfig.test.json paths, root build script, docs/packages/service-worker.md (every package has one), TSDoc on public symbols for site api:strict.
6. Verify: package build, vitest for the package, npm run typecheck:tests, root build + site api:strict, engine-suites --engine node filter (all via heavy.mjs).

## Implementation notes

Package scaffold: packages/service-worker with exports ., ./core, ./runtime (dist/index, dist/core/index, dist/runtime/index). Registered in root build script, vitest.config.ts aliases, tsconfig.test.json paths, package-lock (npm install). docs/packages/service-worker.md added (every package has one; it states the package is under construction).
Core now exports structural types (WorkerScope, WorkerExtendableEvent, WorkerFetchEvent, WorkerClient(s), WorkerClientQueryOptions, WorkerEventMap): the DOM and WebWorker libs cannot be combined, and the repo compiles with DOM. Root and runtime entry points are empty stubs.
In-memory scope: src/testing/{worker-scope,caches,clients}.ts, internal (not exported, excluded from the build). install()/activate() with waitUntil semantics and lifecycle state, dispatchFetch() with respondWith rules and network fallback, idle() for fetch-event extensions, Cache/CacheStorage with buffered bodies (ignoreSearch/ignoreMethod), clients (connectClient, matchAll, get, claim, recorded postMessage copies), skipWaiting, a replaceable network (offline by default). Passes in vitest, the engine-suites vitest shim, AgniJS and QuickJS.
Boundary: src/runtime-boundary.test.ts + src/testing/boundary.ts. Runtime sources may import runtime modules, core/index (relative path or @gablejs/service-worker/core) and other packages; anything else is a violation. Uses node:fs, so engine-suites classifies it out of scope (Node tooling).
Out of scope, for later tickets: message events and waiting/update flows (service-worker/110/106.6); push and sync events (service-worker/111); navigation requests (Node's Request cannot be built with mode 'navigate', so the scope will need a navigate option for the navigation fallback in service-worker/109/106.5); Vary matching, opaque responses and Response.url on cache hits are not modelled. Open question: whether to publish the in-memory scope as a ./testing subpath so app authors can test custom workers. The site's marketing package grid (site/src/packages.ts) is left for service-worker/115.

Verification (2026-11-14, under heavy.mjs): npm run build exit 0 (includes @gablejs/service-worker); package build emits dist/index, dist/core/index, dist/runtime/index (+ .d.ts), and node imports of @gablejs/service-worker, /core and /runtime resolve; npx vitest run packages/service-worker 35/35; npm run typecheck:tests exit 0; npm test 199 files / 1844 tests passed; site api:strict exit 0 (@gablejs/service-worker 3 entries, 7 symbols, 0 undocumented); site test 114/114; site check exit 0 (after re-running npm install so the gable-check bin shim was linked; on Windows npm skips bins whose dist target is missing at install time). Engine suites: worker-scope.test.ts 28/28 under --engine node shim, and 28/28 under AgniJS and QuickJS using the harness binary built in the main checkout; runtime-boundary.test.ts is out of engine scope (node:fs). Planted a ../../core/scope.js import in a runtime file: the boundary test failed naming it; removed.

## Answer

Added @gablejs/service-worker (packages/service-worker) with root, ./core and ./runtime exports, registered in the root build, vitest aliases, tsconfig.test.json paths and the lockfile, plus a short docs/packages/service-worker.md. Core exports structural worker types (WorkerScope and its event, client and cache types), because the repo compiles with the DOM lib and the DOM and WebWorker libs cannot be combined. Root and runtime are empty stubs for service-worker/113 and service-worker/112. An internal in-memory worker scope (src/testing) dispatches install, activate and fetch events with browser waitUntil/respondWith rules, keeps Cache storage in memory, models clients and claim, records skipWaiting, and has a replaceable network; it implements core's WorkerScope and runs in vitest and inside the AgniJS/QuickJS engine suites. runtime-boundary.test.ts enforces that runtime sources import only runtime modules, core's public entry, or other packages. Verified: full root build, typecheck:tests, 1844 repo tests, site api:strict/test/check all pass. Follow-ups noted in implementation notes: message, update, push and sync events, navigate-mode requests, Vary/opaque responses, and whether to publish the scope as a ./testing subpath.
