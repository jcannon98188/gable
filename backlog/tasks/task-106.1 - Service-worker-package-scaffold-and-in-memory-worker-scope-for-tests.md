---
id: TASK-106.1
title: Service worker package scaffold and in-memory worker scope for tests
status: To Do
assignee: []
created_date: '2026-11-13T19:55:00Z'
labels: []
dependencies: []
parent_task_id: TASK-106
ordinal: 262000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every later layer needs a package to live in and a way to test worker code without a browser. This sets up @gable/service-worker with the core, runtime and root subpath exports, and a fake worker scope (fetch events, Cache storage, clients, lifecycle events) used by unit tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Package builds with exports for the root, core and runtime subpaths
- [ ] #2 An in-memory worker scope can dispatch install, activate and fetch events and back caches
- [ ] #3 A test enforces that runtime imports only core public exports
<!-- AC:END -->
