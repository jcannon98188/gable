---
id: TASK-107
title: 'Service worker v1 follow-ups: gaps left by TASK-106'
status: Done
assignee: []
created_date: '2026-11-14T17:29:00Z'
updated_date: '2026-11-14T18:05:00Z'
labels: []
dependencies: []
documentation:
  - docs/adr/0022-service-worker-support-is-one-layered-package-and-web-only.md
ordinal: 270000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-106 shipped @gable/service-worker (ADR 0022) with four known gaps recorded in docs/packages/service-worker.md: an app cannot obtain a push subscription, background sync has no app-side registration, the precache does not verify fetched bytes against the manifest hashes, and the worker does not claim the page on first activation. v1 scope in ADR 0022 includes push and background sync, so the first two are gaps against the agreed scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All subtasks are Done
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the four known gaps from TASK-106: precache verifies fetched files against manifest hashes (skipped where crypto.subtle is missing), app-side push subscription helper, app-side background sync registration plus defineWorker sync handlers, and first-activation clients.claim limited to when no earlier release exists. Final branch verified: build, typecheck:tests, npm test (2123 passed), api:strict and check -w site all exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
