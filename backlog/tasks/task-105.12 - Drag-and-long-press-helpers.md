---
id: TASK-105.12
title: Drag and long-press helpers
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:16:00Z'
labels: []
dependencies:
  - TASK-105.5
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drag and long-press are composed from pointer events plus the Pointer service (TASK-104.8); helper functions were deferred and are now release-blocking (TASK-104.12).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Helper functions provide drag and long-press from pointer events and the Pointer service
- [x] #2 They clean up with their scope and have tests through the test renderer
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added createDrag and createLongPress to @gable/renderer-pixi (src/gestures.ts), used in a component's setup with the node's pointerdown forwarded from the template. Both read the Pointer service per frame flush (moves within a frame coalesce; a press and release inside one flush is a non-event). Drag: threshold (default 4), scene-space delta and step, onStart/onMove/onEnd (cancelled flag), dragging signal, left-button default, cancel(). Long-press: delay (default 500 ms, counted from clamped Frame dt so it is deterministic), tolerance (default 10), pressing signal, cancelled by release or drift. Both end/cancel with the owning scope. Tests: gestures.test.ts (10) through createSceneTestRenderer. Verified after merge (integration 2617d56): root run 87 files, 1002 tests pass; only renderer-dom browser.test.ts failed (a known environment-dependent real-browser test, outside the merged files).
<!-- SECTION:FINAL_SUMMARY:END -->
