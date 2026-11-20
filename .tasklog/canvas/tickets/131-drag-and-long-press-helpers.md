---
kind: ticket
title: Drag and long-press helpers
status: resolved
blocked_by: [124]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.12 - Drag-and-long-press-helpers.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 250000
---

## Question

Drag and long-press are composed from pointer events plus the Pointer service (canvas/113); helper functions were deferred and are now release-blocking (canvas/117).

## Acceptance criteria

- [x] #1 Helper functions provide drag and long-press from pointer events and the Pointer service
- [x] #2 They clean up with their scope and have tests through the test renderer

## Answer

Added createDrag and createLongPress to @gable/renderer-pixi (src/gestures.ts), used in a component's setup with the node's pointerdown forwarded from the template. Both read the Pointer service per frame flush (moves within a frame coalesce; a press and release inside one flush is a non-event). Drag: threshold (default 4), scene-space delta and step, onStart/onMove/onEnd (cancelled flag), dragging signal, left-button default, cancel(). Long-press: delay (default 500 ms, counted from clamped Frame dt so it is deterministic), tolerance (default 10), pressing signal, cancelled by release or drift. Both end/cancel with the owning scope. Tests: gestures.test.ts (10) through createSceneTestRenderer. Verified after merge (integration 2617d56): root run 87 files, 1002 tests pass; only renderer-dom browser.test.ts failed (a known environment-dependent real-browser test, outside the merged files).
