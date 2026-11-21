---
kind: ticket
title: App-side push subscription helper
status: resolved
tags:
  - parent-107
created: 2026-11-14
updated: 2026-11-14
imported_from: backlog/tasks/task-107.2 - App-side-push-subscription-helper.md
assignee:
  - '@claude'
ordinal: 272000
---

## Question

v1 scope in ADR 0022 includes push, but an app can only receive pushes: nothing in the package wraps PushManager.subscribe, permission handling or unsubscribe, so apps must reach into navigator.serviceWorker themselves to get a subscription to send to their server.

## Acceptance criteria

- [x] #1 SwPush exposes subscribe(options) (applicationServerKey, userVisibleOnly), getSubscription() and unsubscribe(), and a notification permission state as a signal
- [x] #2 Unsupported browsers and denied permission are reported as defined outcomes, not thrown surprises
- [x] #3 The in-memory browser models pushManager and permission so the helper is tested end to end with the existing worker-side push handlers
- [x] #4 Public API has TSDoc, the docs cover the flow, and the push subscription entry is removed from the docs limits

## Implementation plan

1. Page-side structural types (additive, container.ts): PushManagerLike, PushSubscriptionLike, NotificationsLike; ServiceWorkerRegistrationLike.pushManager optional. New token SERVICE_WORKER_NOTIFICATIONS (default globalThis.Notification, null where absent) provided by provideServiceWorker.
2. In-memory browser (additive, testing/push.ts + browser.ts): notification permission with a prompt answer, pushManager per registration (subscribe/getSubscription/unsubscribe, active-worker requirement, userVisibleOnly, key mismatch), pushSupported option, deliverPush(endpoint, payload) to the active worker scope.
3. SwPush gets permission signal, requestPermission(), subscribe(options) returning defined outcomes (subscribed/unsupported/unavailable/denied/dismissed/failed), getSubscription(), unsubscribe(). Test first: app/push-subscription.test.ts end to end with onPush/onNotificationClick workers; testing/ tests for the model.
4. TSDoc, docs section, remove push-subscription limit. Verify build, vitest, typecheck:tests, npm test, api:strict, site check, engine suites, mutation check.

## Implementation notes

Seams (tests only at these): SwPush's public API (permission, requestPermission, subscribe, getSubscription, unsubscribe) through DI against pages of the in-memory browser; the in-memory browser's own push model (pushManager, permission and prompt, deliverPush) through page.container and browser.

App side: PushManagerLike, PushSubscriptionLike, PushSubscribeInit, NotificationsLike structural types (container.ts); ServiceWorkerRegistrationLike.pushManager optional; SERVICE_WORKER_NOTIFICATIONS token (default global Notification or null) provided by provideServiceWorker. SwPush: permission signal (default | granted | denied | unsupported), requestPermission(), subscribe(options) resolving { status } of subscribed | unsupported | unavailable | denied | dismissed | failed (never throws; userVisibleOnly defaults true; waits for an active worker; a permission revoked mid-subscribe is denied), getSubscription() (null when none or unsupported), unsubscribe() (false when none, unsupported or failing). The permission signal is re-read by subscribe, requestPermission and getSubscription; the browser has no event for settings changes (documented).

In-memory browser, additive: testing/push.ts (InMemoryPermission with prompts count and a settable answer, InMemoryPushManager: needs active worker, userVisibleOnly true, key, same key returns existing and a different key is InvalidStateError, permission prompt), InMemoryBrowserOptions notificationPermission / permissionAnswer / push, browser.permission, browser.pushSubscriptions(url), browser.deliverPush(endpoint, payload) (drops when permission is not granted or endpoint unknown), page.notifications. Docs: new Push subscription section, SwPush bullet, testing paragraph, push limit reworded to drop the subscription entry.

Mutation check: 18 planted mutations (denied/dismissed/unavailable/unsupported outcomes, userVisibleOnly default, no wait for active worker, revoked-mid-subscribe, getSubscription refresh, unsubscribe not cancelling, permission signal never set, error dropped, and 4 in the in-memory model) all turned tests red, except one equivalent mutant (requestPermission always prompting, since the browser only prompts while default): the redundant guard was removed instead.

Verification (2026-11-14, under heavy.mjs): npm run build exit 0; npx vitest run packages/service-worker 21 files / 247 tests; engine suites node/agnijs/quickjs 239/239 each for packages/service-worker (the runner's exit 1 comes from FIXED entries for core i18n-message and testing i18n tests in suites-expected.json, unrelated); npm run typecheck:tests exit 0; npm test exit 0; api:strict -w site exit 0 (@gablejs/service-worker 3 entries, 115 symbols, 0 undocumented); check -w site exit 0 (after npm install relinked gable-check).

## Answer

SwPush (the app side of @gablejs/service-worker) now subscribes the app to push. permission is a signal (default, granted, denied, unsupported); requestPermission(), subscribe({ applicationServerKey, userVisibleOnly }), getSubscription() and unsubscribe() wrap the permission prompt and PushManager. subscribe never throws: it resolves { status } of subscribed (with the subscription to send to the server), unsupported, unavailable (no registered worker), denied, dismissed or failed (with the browser's error). It waits for an active worker, and a permission revoked mid-subscribe is reported as denied. The in-memory browser now models the notification permission and prompt, a push manager per registration and the push service (deliverPush), so the helper is tested end to end with the worker's onPush and onNotificationClick handlers. TSDoc on all new API; docs gain a Push subscription section and the push-subscription limit is removed. Verified: package tests 247, engine suites 239/239 on node, AgniJS and QuickJS, build, typecheck:tests, npm test, api:strict (0 undocumented) and check -w site all pass; 18 planted mutations turned tests red (one equivalent mutant removed as redundant code). Deferred: no event for permission changes made in browser settings (the signal catches up on the next call, documented); notificationclose and focus-or-open remain as before.
