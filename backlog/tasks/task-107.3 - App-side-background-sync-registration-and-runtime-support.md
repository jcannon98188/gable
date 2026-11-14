---
id: TASK-107.3
title: App-side background sync registration and runtime support
status: To Do
assignee: []
created_date: '2026-11-14T17:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-107
ordinal: 273000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
v1 scope in ADR 0021 includes background sync, but it exists only worker-side in core: an app has no way to register a sync tag, and the default runtime built with defineWorker has no way to handle sync events apart from dropping to the core API by hand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An app-side service registers a sync tag and reports whether Background Sync is supported
- [ ] #2 defineWorker accepts sync handlers keyed by tag and wires them through core backgroundSync, with failures reported to the app as today
- [ ] #3 Behaviour without Background Sync support is defined and documented (register resolves false)
- [ ] #4 Tests pair the app-side registration with a runtime-built worker on the in-memory browser; docs cover it and drop it from the limits
<!-- AC:END -->
