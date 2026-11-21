---
kind: ticket
title: "Core: lifecycle hooks and typed worker-to-app message channel"
status: resolved
blocked_by: [108]
tags:
  - parent-106
created: 2026-11-13
updated: 2026-11-14
imported_from: backlog/tasks/task-106.3 - Core-lifecycle-hooks-and-typed-worker-to-app-message-channel.md
assignee:
  - '@claude'
ordinal: 264000
---

## Question

The app-side services must talk to the default worker and to custom workers, so the message protocol is a public contract owned by core.

## Acceptance criteria

- [x] #1 Install, activate and update lifecycle hooks are exposed with typed handlers
- [x] #2 A typed message channel carries version-ready, version-activated and error events to clients
- [x] #3 The protocol is documented as part of the public API

## Implementation plan

Seams under test: core's public exports (lifecycle(), the protocol types/guards, the app channel), driven through the in-memory worker scope as a browser would drive a real worker.
1. Protocol (src/core/messages.ts): a versioned envelope (protocol marker) for worker-to-app messages version-ready, version-activated and error ({name, message}, phase), and the one app-to-worker request activate-update that app-controlled updates need (ADR 0022). Type guards for both directions so the app side and the worker accept only well-formed protocol messages. A channel (createAppChannel) that broadcasts to every window client, controlled or not.
2. In-memory scope, additive: a message event in core's WorkerEventMap (WorkerMessageEvent: data, source, waitUntil) and InMemoryWorkerScope.dispatchMessage(data, { source }) with waitUntil semantics; the test driver keeps playing the browser for activation after skipWaiting.
3. Lifecycle (src/core/lifecycle.ts): lifecycle(self, { version, install, activate, update }) with typed per-phase contexts. Install runs the hook then posts version-ready; activate runs the hook then posts version-activated; on activate-update the update hook runs and then skipWaiting. A failing hook posts an error event with its phase and still fails the step. Never skips waiting on install (updates are app-controlled). Returns a disposer.
4. TSDoc on all public symbols; protocol documented as public API in the TSDoc and docs/packages/service-worker.md. Core index gets export lines only.
5. Verify: package build, vitest for the package, npm run build, typecheck:tests, npm test, site api:strict (heavy jobs via heavy.mjs).

## Implementation notes

Protocol (src/core/messages.ts): SW_PROTOCOL marker "gable-sw@1"; worker-to-app VersionReadyMessage, VersionActivatedMessage, WorkerErrorMessage (phase install|activate|update|runtime, error {name, message} so it survives postMessage); app-to-worker ActivateUpdateRequest, the one request app-controlled updates need. isWorkerToAppMessage/isAppToWorkerMessage guards; toWorkerErrorInfo; createAppChannel(self) with broadcast (all window clients, controlled or not), reportError and onRequest (protocol requests only, waitUntil on the returned promise).
Lifecycle (src/core/lifecycle.ts): lifecycle(self, { version, install, activate, update }) with typed contexts (InstallContext, ActivateContext, UpdateContext with requestedBy). install hook then version-ready; activate hook then version-activated; activate-update request runs the update hook then skipWaiting. Never skips waiting on install. A failing hook broadcasts an error for its phase and fails its step (a failed update leaves the version waiting). Returns a disposer. All install work (precache included) belongs in the install hook so version-ready means complete; worker code has no portable way to observe other install listeners.
Core scope, additive: message event in WorkerEventMap and WorkerMessageEvent (data, source, waitUntil). In-memory scope: dispatchMessage(data, { source }) with structured-clone data and waitUntil semantics; waiting workers receive messages, redundant ones do not. The test driver still plays the browser for activation after skipWaiting (no auto-activate), so service-worker/109's tests keep their semantics.
Docs: protocol tables and lifecycle usage in docs/packages/service-worker.md plus TSDoc. Core index edit is three export lines.
Mutation check: planting skipWaiting on install, dropping error reports, broadcasting to controlled clients only, skipping the clone, dropping the phase check and dropping the message source each turned the new tests red.

Verification (2026-11-14, under heavy.mjs): npx vitest run packages/service-worker 62/62 (5 files); package build emits dist/core/lifecycle and messages; npm run build exit 0; npm run typecheck:tests exit 0; npm test 202 files / 1871 tests passed; site api:strict exit 0 (@gablejs/service-worker 3 entries, 31 symbols, 0 undocumented). Not run: engine-suites under AgniJS/QuickJS (the new tests use only structuredClone, setTimeout and Response, as the existing scope tests do).

## Answer

Added typed lifecycle hooks and the worker-app message protocol to @gablejs/service-worker/core. lifecycle(self, { version, install, activate, update }) runs typed hooks at each step: after install it broadcasts version-ready, after activate version-activated, and on the app's activate-update request it runs the update hook and then skips waiting. It never skips waiting on install, because ADR 0022 makes updates app-controlled. A failing hook broadcasts an error event for its phase and fails its step. The protocol (messages.ts) is public API: SW_PROTOCOL "gable-sw@1", worker-to-app messages version-ready, version-activated and error ({name, message}, phase), the app-to-worker request activate-update, guards for both directions, and createAppChannel(self) for custom workers. It is documented in TSDoc and in tables in docs/packages/service-worker.md. Core's scope gained a message event (WorkerMessageEvent). The in-memory scope gained dispatchMessage with structured-clone data and waitUntil semantics. Verified: 62 package tests, plus planted mutations that each turned them red; full build, typecheck:tests, 1871 repo tests and site api:strict all pass. Follow-ups for service-worker/113: the app side may need a get-version request for its version Observable on page load, which would be an additive message. version-ready is also sent on a first install, which activates straight away; the app side should ignore it when the page has no controller. Engine-suite runs under AgniJS and QuickJS were not repeated.
