---
id: TASK-106.4
title: 'Core: push and background sync handlers'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T19:56:00Z'
updated_date: '2026-11-14T07:36:00Z'
labels: []
dependencies:
  - TASK-106.2
  - TASK-106.3
parent_task_id: TASK-106
ordinal: 265000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Push and background sync are in v1 scope. Core needs handler primitives that leave the default runtime and custom workers free to use them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Push events and notification clicks are exposed through typed handlers
- [x] #2 Background sync registrations and sync events are exposed through typed handlers
- [x] #3 Tests cover each handler using the in-memory worker scope
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Core scope types, additive: push, notificationclick and sync events in WorkerEventMap (WorkerPushEvent with PushMessageData-like data, WorkerNotificationEvent, WorkerSyncEvent), WorkerScope.registration (showNotification, getNotifications, optional sync manager: Background Sync is Chromium-only) and WorkerClients.openWindow for click handlers.
2. In-memory scope, additive: registration with recorded notifications (tag replaces, close), sync manager (register/getTags, option to model an unsupported browser), dispatchPush, dispatchNotificationClick (openWindow allowed only while the click is handled, as browsers require user activation), dispatchSync (registered tags only; success removes the tag, failure keeps it unless lastChance).
3. core/push.ts: onPush(self, { version, handle?, forward? }) decodes the payload (JSON, text or null, as the protocol says), runs the typed handler with showNotification, forwards the protocol's push message to window clients; onNotificationClick(self, { version, handle?, forward?, keepOpen? }) closes the notification, runs the typed handler (action, notification info, openWindow), forwards notification-click. A failing handler reports a runtime error and fails the event.
4. core/sync.ts: backgroundSync(self, { tag, version, sync }) returns a typed registration handle (register() true/false when unsupported, isRegistered(), dispose); the handler gets { tag, lastChance }; a rejection lets the browser retry, and on the last chance it is reported to the app as a runtime error.
5. Tests first on the in-memory worker scope for each handler, plus an end-to-end test pairing the worker push/click handlers with the app-side SwPush on the in-memory browser.
6. TSDoc, docs/packages/service-worker.md section, minimal core index export lines. Verify package tests, build, typecheck:tests, npm test, site api:strict; engine suites for the service-worker tests if the harness binary can be used.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Seams tested (all through public functions on the in-memory worker scope): onPush via dispatchPush, onNotificationClick via dispatchNotificationClick, backgroundSync via register() and dispatchSync, plus app/push-end-to-end.test.ts pairing a worker built on lifecycle()+onPush+onNotificationClick with the app's SwPush on the in-memory browser (push and click reach SwPush.messages / notificationClicks through the protocol alone).
Core, additive scope types (scope.ts): WorkerEventMap gains push (WorkerPushEvent, data: WorkerPushMessageData | null with text/json/arrayBuffer), notificationclick (WorkerNotificationEvent: notification, action) and sync (WorkerSyncEvent: tag, lastChance). WorkerScope gains registration (WorkerRegistration: showNotification, getNotifications, optional sync: WorkerSyncManager, undefined where the browser lacks Background Sync). WorkerClients gains openWindow (needed by click handlers). Core index: one type export block plus two export lines.
core/push.ts: onPush(self, { version, handle?, forward? }) decodes the payload as the protocol's push message carries it (JSON, else text, else null), runs the handler (context: version, data, raw message, showNotification which extends the event, event) and broadcasts the protocol's push message to every window client; onNotificationClick(self, { version, handle?, forward?, keepOpen? }) closes the notification unless keepOpen, runs the handler (action, notification, openWindow, event) and broadcasts notification-click {action, notification {title, body, tag, data}}. A failing handler reports an error with phase runtime and fails the event. Both return disposers. Handler return type is void | Promise<unknown> so handle: () => openWindow(url) type-checks.
core/sync.ts: backgroundSync(self, { tag, version, sync }) -> { tag (literal-typed), supported, register(): Promise<boolean> (false without Background Sync), isRegistered(), dispose() }. Handler runs only for its tag with { version, tag, lastChance, event }; a rejection fails the attempt so the browser retries; only a failed lastChance is reported to the app as a runtime error.
In-memory scope, additive: testing/registration.ts (InMemoryRegistration: notifications recorded with structured-cloned data, tag replaces, close(); showNotification settles after a timer task, as the browser's is async; InMemorySyncManager), createWorkerScope({ backgroundSync: false }) models Firefox/Safari, dispatchPush/dispatchNotificationClick/dispatchSync (activated worker only; sync only for registered tags, success drops the tag, failure keeps it unless lastChance), clients.openWindow allowed only while a click is handled (InvalidAccessError otherwise), null for other origins, openedWindows log. In-memory browser: activeScope(url).
Limits / not done: notificationclose events, periodic background sync and push subscription (pushManager.subscribe, worker or page side) are not covered; no fallback when Background Sync is missing (register() resolves false and the caller retries by other means, e.g. on worker start); openWindow's permission window is modelled as the click event's lifetime, not the browser's timed user-activation window; no WindowClient.focus/navigate (focus-or-open helpers would need them); the in-memory scope does not model notification permission. Whether the WorkerScope types match a real worker's self cannot be compiled here (DOM and WebWorker libs do not combine); they were written against the spec's PushEvent, NotificationEvent, SyncEvent and ServiceWorkerRegistration shapes.
Mutation check: 19 planted mutations across push.ts, sync.ts and the scope additions (wrong message type, no JSON decode, notification left open, forward default off, showNotification not extending the event, handler error swallowed, notification data dropped, action dropped, click disposer no-op, tag filter dropped, error reported on every attempt, sync rejection swallowed, register true when unsupported, register no-op, lastChance tag kept, openWindow always allowed, tag replacement dropped, cross-origin window visible) all turned tests red; removing the in-memory showNotification delay survives by design (it is what makes the waitUntil mutation observable).

Verification (2026-11-14, under heavy.mjs): npm run build exit 0 (dist/core/push and sync emitted); npx vitest run packages/service-worker 16 files / 171 tests passed; npm run typecheck:tests exit 0; npm test 213 files / 1980 tests passed; npm run api:strict -w site exit 0 (@gable/service-worker 3 entries, 91 symbols, 0 undocumented). Engine suites (run-suites.mjs --filter packages/service-worker, harness exe copied from the main checkout): node 163/163; AgniJS 161/163 and QuickJS 161/163, the two failures pre-existing and not from this task: precache.test.ts 'requests revalidate with the server' (the host prelude's Request has no cache property) and worker-scope.test.ts 'dispatches requests with a destination...' (the prelude's Request has no mode, so 'cors' reads undefined). All four new test files pass on both engines. Response.clone() is implemented by the host prelude (ResponseShim.clone) and strategies.test.ts passes on both engines, so TASK-106.2's concern does not bite in the suites.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added typed push, notification-click and background sync handlers to @gable/service-worker/core.
- onPush(self, { version, handle }) decodes each push payload (JSON, text or null) and passes it to a typed handler that can show notifications. It forwards the protocol's push message to the app's pages.
- onNotificationClick(self, { version, handle }) closes the clicked notification (unless keepOpen) and passes the action, the notification and openWindow to a typed handler. It forwards notification-click.
- backgroundSync(self, { tag, version, sync }) gives a tag-typed handle: register() resolves false in browsers without Background Sync, plus isRegistered() and dispose(). Its handler runs only for its tag, with lastChance. A failed attempt fails the event so the browser retries, and only a failed last chance is reported to the app as a runtime error.
Core's scope types gained push, notificationclick and sync events, WorkerScope.registration and WorkerClients.openWindow, all additive. The in-memory worker scope gained matching dispatch methods, a registration that records notifications and sync tags, and click-gated openWindow. The in-memory browser gained activeScope(). A test pairs these worker handlers with the app-side SwPush end to end. Documented in TSDoc and in docs/packages/service-worker.md.
Verified: 171 package tests; 19 planted mutations all red. npm run build, typecheck:tests, npm test (1980 tests) and site api:strict (0 undocumented) all pass. The new tests also pass under AgniJS and QuickJS. The two engine failures in the service-worker files predate this task: the prelude's Request lacks cache and mode.
Follow-ups (not done): notificationclose, periodic sync, push subscription, a fallback when Background Sync is missing, WindowClient.focus for focus-or-open, and making the host prelude's Request carry cache/mode for the two pre-existing engine failures.
<!-- SECTION:FINAL_SUMMARY:END -->
