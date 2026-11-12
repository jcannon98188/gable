---
id: TASK-105.6
title: Assets service and bundle handles
status: To Do
assignee: []
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T21:47:00Z'
labels: []
dependencies:
  - TASK-105.3
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 244000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.9: app-level Assets service with provideAssets({ bundles }), bundle handles with status, progress and error signals and idempotent load() and unload(), ref-counted bundle lifetime tied to the caller's scope via onCleanup (keepAlive opts out), strings in [texture] resolved synchronously from Pixi's cache with a dev warning when not loaded, spritesheets and fonts as plain bundle entries, node removal never destroys bundle textures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 inject(Assets).bundle(name) returns a handle with status, progress, error, load and unload
- [ ] #2 [texture] strings resolve from Pixi's cache; a missing alias warns in dev naming the alias
- [ ] #3 Bundles unload when the last loading scope is disposed unless keepAlive is set
- [ ] #4 Spritesheet frame names and bitmap fonts work from bundle entries
- [ ] #5 @if and @defer (when ...) over the handle's signals drive loading UI in a documented example
<!-- AC:END -->
