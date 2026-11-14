---
id: TASK-107
title: 'Service worker v1 follow-ups: gaps left by TASK-106'
status: To Do
assignee: []
created_date: '2026-11-14T17:29:00Z'
labels: []
dependencies: []
documentation:
  - docs/adr/0021-service-worker-support-is-one-layered-package-and-web-only.md
ordinal: 270000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-106 shipped @gable/service-worker (ADR 0021) with four known gaps recorded in docs/packages/service-worker.md: an app cannot obtain a push subscription, background sync has no app-side registration, the precache does not verify fetched bytes against the manifest hashes, and the worker does not claim the page on first activation. v1 scope in ADR 0021 includes push and background sync, so the first two are gaps against the agreed scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks are Done
<!-- AC:END -->
