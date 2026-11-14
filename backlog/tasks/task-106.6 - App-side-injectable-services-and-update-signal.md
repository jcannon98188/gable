---
id: TASK-106.6
title: 'App side: injectable services and update signal'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T19:56:00Z'
updated_date: '2026-11-14T07:20:00Z'
labels: []
dependencies:
  - TASK-106.3
parent_task_id: TASK-106
ordinal: 267000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apps need to register the worker and decide when users get new code. Updates are app-controlled: the app is told one is ready and activates it when it chooses. The services must work with the default worker and a custom one, so they depend only on the message protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Registration service registers only in production builds and is a no-op in dev so HMR is unaffected
- [x] #2 Update-available is a signal; checkForUpdate() and activateUpdate() work
- [x] #3 Version, push and notification-click events are exposed as Observables
- [x] #4 Tested against the in-memory worker scope and against a custom worker built on core
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root entry @gable/service-worker gains structural page-side types (ServiceWorkerContainerLike, registration, worker) that navigator.serviceWorker satisfies, so tests can supply a fake. Depends on @gable/core (signals, DI) and rxjs as a peer, like @gable/store.
2. provideServiceWorker({ url, scope, type, enabled }) and root-scoped services mirroring Http/I18n conventions: SwRegistration (registers only when enabled, default only in production builds via __GABLE_DEV__ === false; no-op in dev; exposes the protocol message stream), SwUpdates (updateAvailable signal, checkForUpdate(): Promise<boolean>, activateUpdate(): Promise<void>, versions Observable), SwPush (messages and notificationClicks Observables). Services read only protocol messages plus the standard registration/waiting worker.
3. Protocol: add minimal push and notification-click worker-to-app messages (additive) to core/messages.ts with guard support, for TASK-106.4 to send.
4. Tests (test-first): an in-memory browser harness in src/testing that plays navigator.serviceWorker on top of the in-memory worker scope (register, update, waiting, skipWaiting activation, controllerchange, message delivery to pages); small additive onMessage hook on in-memory clients. Service tests against a lifecycle()-based worker and a custom worker built on createAppChannel alone; dev no-op test.
5. TSDoc for all public API; docs/packages/service-worker.md section; full verification (package build, npm run build, typecheck:tests, npm test, site api:strict) under heavy.mjs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
App side (src/app, exported from src/index.ts): structural page types ServiceWorkerContainerLike/RegistrationLike/WorkerLike (navigator.serviceWorker satisfies them; registration.ts compiles that assignment). provideServiceWorker({ url, scope, type, enabled }) provides SERVICE_WORKER_OPTIONS and SERVICE_WORKER_CONTAINER (default navigator.serviceWorker or null). Root-scoped services: SwRegistration (registers on creation only when enabled, default __GABLE_DEV__ === false read lazily; listens for messages before registering; failure -> ErrorHandler via reportError, ready resolves null; listener removed and stream completed on injector destroy), SwUpdates (updateAvailable signal, true on version-ready only when the page is controlled, recomputed from registration.waiting on ready and on version-activated; checkForUpdate(): Promise<boolean> resolves on version-ready or false when the installing worker turns redundant, rejects when update() rejects; activateUpdate(): Promise<boolean> waits out an in-progress install, posts activate-update, resolves on version-activated or the worker reaching activated, rejects with the worker's error on an update-phase error, false if no version waits or it turns redundant; versions Observable), SwPush (messages, notificationClicks).
Protocol, additive: worker-to-app PushMessage {version, data} and NotificationClickMessage {version, action, notification {title, body, tag, data}} with guard support, for TASK-106.4 to send. No get-version request added: the ACs do not need it (versions emits events; updateAvailable is recomputed from the registration on load).
Testing: src/testing/browser.ts, an in-memory browser over the in-memory worker scope (pages, register/update, waiting, Try Activate when no page is controlled, skipWaiting activation with controllerchange, async message delivery). Additive onMessage option on in-memory clients. Service tests run every update test against a lifecycle()-based worker and a custom worker on createAppChannel alone. app-boundary test: root entry and src/app never import the runtime. Package now depends on @gable/core and peers rxjs, as @gable/store does (lockfile entry updated by npm install).
Mutation check: 15 planted mutations (dev registers, enabled ignored, error swallowed, first install flagged as update, no refresh on ready/activated, redundant fallback dropped, update error resolved, wrong request type, controlled check dropped, push filter, click action, listener kept after destroy, two guard mutations) all turned tests red.

Verification (2026-11-14, under heavy.mjs): npx vitest run packages/service-worker 96/96 (9 files); npm run build exit 0 (dist/app emitted, dist/index.js has no runtime import); npm run typecheck:tests exit 0; npm test 1905/1906 passed, the one failure is packages/renderer-dom/src/browser.test.ts (headless Chrome dump-dom, the load flake its retry comment describes) which passed when rerun alone; site api:strict exit 0 (@gable/service-worker 3 entries, 53 symbols, 0 undocumented). AC evidence: #1 the SwRegistration dev/prod/enabled/unsupported tests; #2 the SwUpdates describe.each tests; #3 versions in SwUpdates tests plus the SwPush tests; #4 each SwUpdates test runs against a lifecycle() worker and a createAppChannel-only custom worker, both on the in-memory worker scope via the in-memory browser.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the app side of @gable/service-worker (root entry). provideServiceWorker({ url, scope, type, enabled }) sets an app up. SwRegistration registers the worker when it is created, in production builds only (__GABLE_DEV__ === false, as @gable/vite defines on build); in development it does nothing, so HMR is unaffected. SwUpdates exposes updateAvailable as a signal, plus checkForUpdate(), activateUpdate() and a versions Observable. updateAvailable ignores the first install, since an uncontrolled page already runs the newest code. activateUpdate() rejects with the worker's error when the update hook fails. SwPush exposes the messages and notificationClicks Observables. The services read workers only through the message protocol and the registration's standard slots. The page types are structural, and navigator.serviceWorker satisfies them. Protocol change, additive: push and notification-click worker-to-app messages, which TASK-106.4 will send. Tests use a new in-memory browser built over the in-memory worker scope. Every update test runs against a lifecycle() worker and against a custom worker built on createAppChannel alone. 15 planted mutations all turned the tests red. An app-boundary test keeps the runtime out of the root entry. The package now depends on @gable/core and peers rxjs. Build, typecheck:tests and site api:strict pass. npm test had one failure, the renderer-dom headless-browser load flake, which passed when rerun alone. Follow-ups, not done: a get-version request (not needed by the ACs); push subscription (pushManager.subscribe) is not wrapped.
<!-- SECTION:FINAL_SUMMARY:END -->
