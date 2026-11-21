---
kind: ticket
title: App-side background sync registration and runtime support
status: resolved
tags:
  - parent-107
created: 2026-11-14
updated: 2026-11-14
imported_from: backlog/tasks/task-107.3 - App-side-background-sync-registration-and-runtime-support.md
assignee:
  - '@claude'
ordinal: 273000
---

## Question

v1 scope in ADR 0022 includes background sync, but it exists only worker-side in core: an app has no way to register a sync tag, and the default runtime built with defineWorker has no way to handle sync events apart from dropping to the core API by hand.

## Acceptance criteria

- [x] #1 An app-side service registers a sync tag and reports whether Background Sync is supported
- [x] #2 defineWorker accepts sync handlers keyed by tag and wires them through core backgroundSync, with failures reported to the app as today
- [x] #3 Behaviour without Background Sync support is defined and documented (register resolves false)
- [x] #4 Tests pair the app-side registration with a runtime-built worker on the in-memory browser; docs cover it and drop it from the limits

## Implementation plan

1. Tests first: testing/browser-sync.test.ts (in-memory browser sync model: page-side registration.sync, shared across versions, needs active worker, backgroundSync:false), app/sync.test.ts (SwSync vs core backgroundSync worker), runtime/sync.test.ts (defineWorker({ sync }) on the in-memory scope, and SwSync paired with a defineWorker worker on the in-memory browser).
2. App side: SyncManagerLike + ServiceWorkerRegistrationLike.sync? (container.ts); SwSync (app/sync.ts): isSupported(), register(tag) -> boolean (false when unsupported/unavailable/refused, never throws), getTags(); shared whenActive helper (app/active.ts). Export from index.
3. Runtime: defineWorker({ config, sync }) with handlers keyed by tag, each wired through core backgroundSync(self, { tag, version, sync }), validated (function handlers, non-empty tags) with ServiceWorkerConfigError; disposer removes them.
4. In-memory browser, additive: InMemoryBrowserOptions.backgroundSync, one InMemorySyncManager per registration shared by all versions (WorkerScopeOptions.syncManager), page-side manager that needs an active worker.
5. TSDoc, docs section, drop the sync limit, testing paragraph. Verify build, vitest, typecheck:tests, npm test, api:strict, site check, engine suites, mutation check.

## Implementation notes

Seams (tests only at these): SwSync's public API (isSupported, register, getTags) through DI against pages of the in-memory browser (app/sync.test.ts, with a core backgroundSync worker); defineWorker({ sync }) on the in-memory worker scope and paired with SwSync on the in-memory browser (runtime/sync.test.ts); the in-memory browser's sync model (testing/browser-sync.test.ts).
App side: SyncManagerLike + ServiceWorkerRegistrationLike.sync? (container.ts); SwSync (app/sync.ts): isSupported() (registered worker whose registration has a sync manager), register(tag) -> boolean (waits for an active worker through whenActive, now shared in app/active.ts; false when unsupported, unavailable or refused; never throws), getTags() ([] when unsupported or failing). Exported from the root entry; the app boundary test stays green.
Runtime: defineWorker({ config, sync }) takes handlers keyed by tag, each wired through core backgroundSync(self, { tag, version, sync }) in start(); the disposer removes them; a non-function handler or empty tag is a ServiceWorkerConfigError (subject defineWorker options, paths sync.<tag> and sync[""]). Failures reported as before (failed last chance -> runtime error to the app). A tag with no handler is dropped by the browser without effect.
In-memory browser, additive: InMemoryBrowserOptions.backgroundSync (default true), one InMemorySyncManager per registration shared by all worker versions (WorkerScopeOptions.syncManager / InMemoryRegistrationOptions.syncManager), page-side registration.sync that needs an active worker (InvalidStateError otherwise).
Mutation check: 14 planted mutations (no-sync guard, wait for active, register/getTags error swallowing, isSupported, only first handler wired, dispose, wrong version, handler/tag validation, active-worker requirement, backgroundSync flag, shared manager across versions) - 13 turned tests red; the survivor (register guard dropping the !manager check) is equivalent, because the TypeError is caught and still resolves false.
Verification (2026-11-14, under heavy.mjs): npm run build exit 0; npx vitest run packages/service-worker 25 files / 268 tests; npm run typecheck:tests exit 0; npm test 223 files / 2097 tests; api:strict -w site exit 0 (@gablejs/service-worker 3 entries, 117 symbols, 0 undocumented); check -w site exit 0 (after npm install relinked gable-check); engine suites node/agnijs/quickjs 260/260 each for packages/service-worker (the runner's exit 1 comes from FIXED entries for core i18n-message and testing i18n tests in suites-expected.json, unrelated).
AC evidence: #1 app/sync.test.ts and runtime/sync.test.ts (register true, getTags, isSupported); #2 runtime/sync.test.ts defineWorker({ sync }) (per-tag handlers, retry vs last-chance error to the app, disposer, validation); #3 app/sync.test.ts and runtime/sync.test.ts without Background Sync (register false, isSupported false, getTags []), docs Background sync section; #4 runtime/sync.test.ts SwSync with a defineWorker worker, docs updated and limit reworded.

## Answer

Added background sync registration on the app side and sync handlers to the default worker. SwSync (root entry) has isSupported(), register(tag) and getTags(): register waits for the worker to be active and resolves true once the browser has the tag, and resolves false, never throwing, without Background Sync, without a registered worker, or when the browser refuses. defineWorker({ config, sync }) takes handlers keyed by tag and wires each through core backgroundSync with the release version, so retries and last-chance runtime errors behave as before; invalid handlers or tags are a ServiceWorkerConfigError. The in-memory browser now models Background Sync (backgroundSync option, a sync manager per registration shared by worker versions, active-worker requirement). Docs gain the app-side and defineWorker sections, the SwSync bullet and the testing note; the limit now only states the platform restriction. Verified: 268 package tests, engine suites 260/260 on node, AgniJS and QuickJS, build, typecheck:tests, npm test (2097), api:strict (0 undocumented), check -w site; 13 of 14 planted mutations killed (one equivalent). Follow-ups: no built-in fallback retry where Background Sync is missing; no periodic sync.
