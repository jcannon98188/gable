---
id: TASK-105.1
title: >-
  Canvas core changes: renderer boundary, Renderer.destroy, public flush,
  onCleanup, hotData
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T22:39:00Z'
labels: []
dependencies: []
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The canvas binding needs five small additive changes to @gable/core, decided in TASK-104.5, .6, .9, .12 and .13: a renderer boundary declared in static meta (ADR 0019), optional Renderer.destroy(), the synchronous flush pair (flushSync, whenFlushed) made public (main entry if safe, otherwise a new @gable/core/frame entry, never /internal), a public scope-cleanup hook onCleanup, and a dev-only hotData(key, create) primitive so a component's non-copyable resource survives hot edits. The spike branch prototype/pixi-renderer-spike has a working first cut of the boundary, destroy and onCleanup in packages/core/src/component.ts to start from.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 meta.renderer declares a renderer boundary: template and projected slot content build with the boundary renderer, sharing the host scope and injector, per ADR 0019
- [ ] #2 Renderer.destroy is optional and is called when a boundary host is destroyed
- [ ] #3 flushSync and whenFlushed are importable from a public entry point, not /internal
- [ ] #4 onCleanup registers a callback run when the calling scope is disposed
- [ ] #5 hotData(key, create) returns the stored value for the component identity in dev and just calls create in production
- [ ] #6 All existing core tests pass unchanged and each new API has tests
<!-- AC:END -->
