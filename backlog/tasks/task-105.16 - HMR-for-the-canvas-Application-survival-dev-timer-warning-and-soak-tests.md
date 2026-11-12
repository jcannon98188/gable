---
id: TASK-105.16
title: 'HMR for the canvas: Application survival, dev timer warning and soak tests'
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:35:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.4
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 254000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.13: <gable-canvas> keeps its Application and renderer in hotData so host and provider edits do not recreate the GL context; the dev build warns when a component registers a raw setInterval or setTimeout without onCleanup; release-gate tests close the spike's unmeasured gaps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Editing the host class or adding a field to a root service keeps the same Application and GL context
- [ ] #2 The dev warning fires for raw timers without onCleanup
- [ ] #3 A soak script runs 200 or more edits with forced GC and records heap and Pixi resource growth
- [ ] #4 Tests cover a real setInterval in a field versus a service, a non-cyclic field transfer, a useValue service and direct applyUpdate
<!-- AC:END -->
