---
kind: ticket
title: "Service worker v1 follow-ups: gaps left by service-worker/106"
status: resolved
created: 2026-11-14
updated: 2026-11-14
imported_from: backlog/tasks/task-107 - Service-worker-v1-follow-ups-gaps-left-by-TASK-106.md
documentation:
  - docs/adr/0022-service-worker-support-is-one-layered-package-and-web-only.md
ordinal: 270000
---

## Question

service-worker/106 shipped @gablejs/service-worker (ADR 0022) with four known gaps recorded in docs/packages/service-worker.md: an app cannot obtain a push subscription, background sync has no app-side registration, the precache does not verify fetched bytes against the manifest hashes, and the worker does not claim the page on first activation. v1 scope in ADR 0022 includes push and background sync, so the first two are gaps against the agreed scope.

## Acceptance criteria

- [x] #1 All subtasks are Done

## Answer

Closed the four known gaps from service-worker/106: precache verifies fetched files against manifest hashes (skipped where crypto.subtle is missing), app-side push subscription helper, app-side background sync registration plus defineWorker sync handlers, and first-activation clients.claim limited to when no earlier release exists. Final branch verified: build, typecheck:tests, npm test (2123 passed), api:strict and check -w site all exit 0.
