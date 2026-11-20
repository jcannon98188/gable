---
kind: ticket
title: Golden-image tests
status: resolved
blocked_by: [129]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.14 - Golden-image-tests.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 252000
---

## Question

canvas/115 deferred golden images until a real game needs them; canvas/117 made them release-blocking. Decide stable GPU or software-GL rendering conditions and tolerance as part of the work.

## Acceptance criteria

- [ ] #1 A small set of scenes is compared against stored images in real Chromium with a documented tolerance
- [x] #2 The stability conditions (renderer, flags, platform) are documented
- [x] #3 The suite runs in CI or has a documented manual run

## Answer

Golden-image suite merged from impl/105.14 (bb78cb9): golden-image compare module, browser golden page, runner, README documenting renderer/flags/platform stability conditions and tolerance. Goldens are NOT committed. The golden-images CI job needs bootstrapping via workflow_dispatch with update_goldens before it can compare (AC #1 stays unchecked until goldens are stored). Hyphenated tags in templates (tiling-sprite, rounded-rect) now work via Renderer.knowsElement (f6fd4ee). Verified post-merge: core build ok; vitest core/renderer-pixi/testing 719 passed, 2 skipped.
