---
kind: ticket
title: "Runtime: default declarative worker driven by gable.sw.json"
status: resolved
blocked_by: [109, 110, 111]
tags:
  - parent-106
created: 2026-11-13
updated: 2026-11-14
imported_from: backlog/tasks/task-106.5 - Runtime-default-declarative-worker-driven-by-gable.sw.json.md
assignee:
  - '@claude'
ordinal: 266000
---

## Question

Most apps should get offline support from configuration alone. The runtime wires core primitives from a config file and must use only core public surface, so gaps in core show up here.

## Acceptance criteria

- [x] #1 gable.sw.json supports asset groups (prefetch and lazy), data groups (freshness and performance) and a navigation fallback
- [x] #2 Config is validated with clear errors
- [x] #3 defineWorker({ config, extend }) adds custom routes and handlers on top of the declarative behaviour
- [x] #4 Runtime uses only core public exports

## Implementation plan

1. Config (runtime/config.ts): ServiceWorkerConfig types for gable.sw.json (assetGroups {name, installMode prefetch|lazy, files globs}, dataGroups {name, urls, strategy freshness|performance, timeoutMs}, navigationFallback {url, exclude}); validateConfig(value) collects every issue with its JSON path and throws ServiceWorkerConfigError.
2. Manifest input (runtime/manifest.ts): AssetManifest { version, files } as the Vite plugin (service-worker/114) will emit; validateManifest(config, manifest) checks shape and that the fallback URL is prefetched.
3. Globs (runtime/glob.ts): ** and * path globs, absolute URL globs, used for asset files, data URLs and fallback excludes.
4. Worker (runtime/worker.ts): defineWorker({ config, extend }) -> { config, start(self, manifest) }. start wires core only: createPrecache for prefetch files, lifecycle() (install precache then extension hook; activate cleans precache, lazy and dropped data caches then extension hook; update hook), one fetch router with extension routes first, then precache, lazy (cacheFirst per version), navigation fallback (navigate-mode GETs not excluded -> precached fallback), data groups (freshness -> networkFirst, performance -> staleWhileRevalidate); onPush (payload.notification shown) and onNotificationClick (data.url opened) with forwarding; extension may replace push/click handlers and add lifecycle hooks.
5. Tests first (vitest, in-memory scope): config validation, each group kind, fallback, extend ordering, cache cleanup; end-to-end with SwUpdates and SwPush on the in-memory browser (share CacheStorage across versions in the browser, additive testing change).
6. Docs (TSDoc, docs/packages/service-worker.md), boundary test stays green, build/typecheck/test/api:strict, engine suites.

## Implementation notes

Seams tested (all through the runtime's public entry): validateConfig/defineWorker config errors (config.test.ts); defineWorker(...).start(scope, manifest) on the in-memory worker scope, driven by install/activate/dispatchFetch/dispatchMessage/dispatchPush/dispatchNotificationClick/dispatchSync (worker.test.ts, extend.test.ts); and runtime/end-to-end.test.ts, a defineWorker-built worker with hand-written manifests paired with SwUpdates and SwPush on the in-memory browser (first install not offered, update offered while v1 keeps serving offline, activateUpdate() switches and v1's caches are removed, a failed prefetch is never offered, push/click reach SwPush).
Runtime (src/runtime): config.ts (ServiceWorkerConfig and group types, validateConfig collecting every issue with its JSON path, unknown keys rejected, ServiceWorkerConfigError with issues[]); manifest.ts (AssetManifest { version, files } as the input contract for the Vite plugin service-worker/114, validateManifest(config, manifest) incl. shell-must-be-prefetched; sortAssets internal); glob.ts (internal: * within a segment, ** across segments, absolute patterns for data groups, query ignored); worker.ts (defineWorker({ config, extend }) -> { config, start(self, manifest) -> disposer }).
Behaviour: prefetch files -> core createPrecache (gable-precache:<version>); lazy -> cacheFirst into gable-lazy:<version>; navigation fallback -> navigate-mode same-origin GETs not excluded (default exclude /**/*.* , replaced when set) answered from the precached shell; dataGroups freshness -> networkFirst (timeoutMs), performance -> staleWhileRevalidate, cache gable-data:<name>, GET only. Activation removes other releases' lazy caches and data caches of groups no longer configured (precache.activate handles precache). lifecycle() gives app-controlled updates; onPush shows payload.notification (needs a string title), onNotificationClick opens notification.data.url for clicks on the body; both forward. Route order: extension routes, precache, lazy, fallback, data groups.
extend(context { self, version, config, manifest, router, precache }) may add routes (tried first) and core handlers (e.g. backgroundSync), and return { install, activate, update } hooks (run after the declarative work in the same lifecycle step, failures reported as for lifecycle()) and push/notificationClick handlers replacing the defaults (forwarding stays).
Core gaps: none found; the runtime imports only ../core/index.js (boundary test green). WorkerDefinitionOptions.config also accepts Readonly<Record<string, unknown>> because a JSON import widens literal strings.
Testing infra, additive: createWorkerScope({ caches }) shares Cache storage; the in-memory browser now shares one Cache storage across an origin's worker versions (browser.test.ts covers it), which makes the end-to-end cache-cleanup assertion meaningful.
Limits / not done: no maxAge/maxSize for data caches (core strategies have no expiry); no asset-group urls for other origins (a performance data group covers them); lazy and prefetch files are refetched per release (no per-file hashes in the manifest yet; a hash per file would let unchanged files carry over); no clients.claim() on first activation, so a first visit is served by the worker only from its next load; notification click opens a new window rather than focusing an existing one (no WindowClient.focus in core); no JSON schema file for gable.sw.json ($schema is accepted and ignored).
Mutation check: 28 planted mutations across worker.ts, manifest.ts, glob.ts and config.ts; all turned the runtime tests red (two survivors in the first run, single-segment * and same-origin path matching, led to a new data-group test).

Verification (2026-11-14, under heavy.mjs): npm run build exit 0 (dist/runtime/{config,glob,manifest,worker,index} emitted); npx vitest run packages/service-worker 20 files / 220 tests passed; npm run typecheck:tests exit 0; npm test 217 files / 2029 tests passed; npm run api:strict -w site exit 0 (@gable/service-worker 3 entries, 107 symbols, 0 undocumented). Engine suites (run-suites.mjs --filter packages/service-worker, harness exe copied from the main checkout): node 212/212; AgniJS 210/212 and QuickJS 210/212, the same two older failures as before (precache.test.ts 'requests revalidate with the server', worker-scope.test.ts 'dispatches requests with a destination...', the prelude's Request lacks cache/mode); all four runtime test files and browser.test.ts pass on both engines. AC evidence: #1 worker.test.ts 'asset groups', 'releases', 'data groups', 'navigation fallback' plus end-to-end.test.ts; #2 config.test.ts (every issue with its JSON path, unknown settings, one message naming gable.sw.json) and worker.test.ts 'the asset manifest' / shell-must-be-prefetched; #3 extend.test.ts (routes tried first, context, install/activate/update hooks, core handlers alongside, push/click handlers replacing defaults, disposer); #4 runtime-boundary.test.ts passes, runtime imports only ../core/index.js, no core change was needed.

## Answer

Built the default declarative worker in @gable/service-worker/runtime.
- gable.sw.json (ServiceWorkerConfig) has asset groups (prefetch, the default, or lazy, picking build files by glob), data groups (freshness = network first with optional timeoutMs, performance = cache with background refresh) and a navigation fallback (the precached shell answers same-origin GET navigations; exclude defaults to file-like paths).
- validateConfig reports every problem with its JSON path in one ServiceWorkerConfigError; unknown settings are errors. validateManifest checks the build's AssetManifest { version, files } (the typed, documented input contract for the service-worker/114 Vite plugin) and that the shell is prefetched.
- defineWorker({ config, extend }).start(self, manifest) wires core only: createPrecache, cacheFirst/networkFirst/staleWhileRevalidate on one router, lifecycle() for app-controlled updates, and onPush/onNotificationClick (shows payload.notification, opens data.url, forwards both to the app). Release caches are cleaned on activation; data caches outlive releases unless the group is dropped. extend adds routes (tried first), core handlers, lifecycle hooks run after the declarative work, and replacement push/click handlers.
- No core gaps; the boundary test passes. The in-memory browser now shares an origin's Cache storage across worker versions (additive testing option).
Verified: 220 package tests, including an end-to-end test of the runtime worker with SwUpdates and SwPush on the in-memory browser. 28 planted mutations all turned the tests red. Build, typecheck:tests, npm test (2029), site api:strict (0 undocumented) all pass. Engine suites: node 212/212, AgniJS and QuickJS 210/212 (only the two older Request cache/mode failures).
Follow-ups (not done): maxAge/maxSize for data caches; asset-group urls on other origins; per-file hashes so unchanged files carry over between releases; clients.claim() on first activation; focusing an existing window on notification click; a JSON schema for gable.sw.json.
