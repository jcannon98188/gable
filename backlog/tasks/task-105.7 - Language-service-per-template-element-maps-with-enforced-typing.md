---
id: TASK-105.7
title: 'Language service: per-template element maps with enforced typing'
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:17:00Z'
labels: []
dependencies:
  - TASK-105.2
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The template language service is DOM-only today (packages/language-service/src/emit.ts uses HTMLElementTagNameMap) and unknown tags resolve to any. TASK-104.7 requires typing enforced for scene templates: a boundary meta.renderer implies the Pixi element map, scene components carry a marker, one TS element map from /elements is the source of truth with a conformance test, errors by default, dotted paths only for point-like axes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scene templates are type-checked against the Pixi element map: unknown tags, properties, wrong value types and event types are errors
- [ ] #2 Dotted paths such as [scale.x] type-check only for point-like axes
- [ ] #3 DOM templates are unchanged
- [ ] #4 Completions work for scene tags and properties
- [ ] #5 A conformance test ties the map to the shared table
<!-- AC:END -->
