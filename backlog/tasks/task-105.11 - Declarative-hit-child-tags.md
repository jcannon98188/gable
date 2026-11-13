---
id: TASK-105.11
title: Declarative hit-* child tags
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:27:00Z'
labels: []
dependencies:
  - TASK-105.5
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 249000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.8 deferred declarative hit areas; TASK-104.12 made them release-blocking. They use the same attachment-child pattern as graphics shapes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hit-shape child tags set a node's hitArea declaratively and update with signals
- [x] #2 Element map, test renderer and docs cover them
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added declarative hit-* child tags (hit-rect, hit-circle, hit-ellipse, hit-polygon, hit-rounded-rect) that set the parent's hitArea and update with signals. Multiple hit children combine as a union. An explicit [hitArea] property takes precedence over hit children. Element map, scene-test renderer (hit-tags tests) and docs/canvas-hit-areas.md cover them; language-service scene conformance updated. Reconciled with the existing hook: impl/105.11 added Renderer.isNativeTag duplicating Renderer.knowsElement; kept knowsElement only (core renderer.ts/view.ts, Pixi and scene-test renderers; knowsElement now also covers hit tags) and removed isNativeTag. Verified: core/testing/renderer-pixi/language-service builds clean; vitest over core, renderer-pixi, testing, language-service passed (933 passed, 2 skipped).
<!-- SECTION:FINAL_SUMMARY:END -->
