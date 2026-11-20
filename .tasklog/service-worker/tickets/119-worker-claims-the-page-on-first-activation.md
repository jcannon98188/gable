---
kind: ticket
title: Worker claims the page on first activation
status: resolved
tags:
  - parent-107
created: 2026-11-14
updated: 2026-11-14
imported_from: backlog/tasks/task-107.4 - Worker-claims-the-page-on-first-activation.md
assignee:
  - '@claude'
ordinal: 274000
---

## Question

On a first visit the worker installs and activates but does not control the page that registered it, so the app is not offline-ready until a reload. Updates must stay app-controlled, so claiming has to be limited to the case where there is no previous release to protect.

## Acceptance criteria

- [x] #1 On first activation, when no previous release controls any page, the worker claims its clients so the registering page is controlled without a reload
- [x] #2 Activation of an update never claims clients on its own: app-controlled updates behave as before
- [x] #3 The app-side services handle the controller change on first claim without reporting a false update
- [x] #4 The create-gable browser test proves offline works after the first visit without a reload; docs drop this from the limits

## Implementation plan

1. Signal for first vs update: Precache.hasEarlierRelease() (another release's cache with its completion record exists in Cache storage). Persisted, so it survives the worker being stopped between install and activate; an in-memory install-time snapshot would not.
2. defineWorker activate hook: ask hasEarlierRelease() before precache.activate() deletes old caches; claim clients if none (after cleanup, before extension.activate). Update activation never claims.
3. In-memory browser: clients.claim() switches open pages to the claiming version and fires controllerchange.
4. Tests (red first): precache.hasEarlierRelease, worker claim/no-claim (incl. stray uncontrolled client on update), browser claim, e2e with SwUpdates (no false update at version events or controllerchange, once), create-gable browser test without the pre-offline reload.
5. Docs: drop First visit from Limits, update the First visit lifecycle bullet.
6. Verify full suite, engine suites, mutation checks.

## Implementation notes

Decision: the first-vs-update signal is persisted state (an earlier release's installed precache cache), not an install-time snapshot of registration.active: a worker stopped between install and a later activate would lose an in-memory flag, and an update that waits long enough is exactly that case. Checked before precache.activate() deletes older caches.

## Answer

The default worker (defineWorker) now claims the registering page on its first activation, so the page is controlled and works offline without a reload. An update activation never claims.

How the worker knows it is a first release: new Precache.hasEarlierRelease() is true when another release's cache, carrying its completion record, exists in Cache storage. The activate hook asks it before precache.activate() removes older caches, then claims (after cleanup, before the extension's activate hook) only when there is none. The signal lives in Cache storage, so it survives the worker being stopped between install and activate, which an in-memory flag from the install event would not. Failed or interrupted installs leave no completion record and do not count. If an earlier release's cache survives without its worker, it errs safe: no claim, controlled from the next load.

In-memory browser: clients.claim() now switches open pages to the claiming version and fires controllerchange (InMemoryClients.onClaim hook, small and additive).

App-side services: SwUpdates/SwRegistration needed no code change. updateAvailable is false at version-ready, version-activated and controllerchange on a first claim (proved by an end-to-end test that samples it at each); a first claim fires controllerchange once.

Tests: precache hasEarlierRelease (3), worker claim/no-claim (4, incl. a stray uncontrolled client on an update and a failed predecessor), browser claim (2), e2e with SwUpdates (2), create-gable browser test now checks controller non-null on the first-visit page, no banner, offline fetch from that same page, with no reload before going offline.

Docs: First visit dropped from Limits; lifecycle bullet rewritten.

Verification: build, typecheck:tests, api:strict, check -w site all pass; vitest packages/service-worker 272/272; engine suites node 264/0, agnijs 256 pass/8 skipped, quickjs 256 pass/8 skipped (hash tests skip by design); create-gable scaffold browser test ran in a real headless browser and passed. Mutation checks: claim always, never claim, inverted, and asking after cleanup each fail tests; disabling the claim fails the create-gable browser test (times out waiting for a controller). Full npm test: one failure in packages/renderer-dom/src/browser.test.ts (known flaky headless browser), which passed on rerun alone. run-suites exits 1 only because of unrelated i18n "FIXED" entries in suites-expected.json that the filter leaves unrun.
