---
id: TASK-105.14
title: Golden-image tests
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:20:00Z'
labels: []
dependencies:
  - TASK-105.10
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.10 deferred golden images until a real game needs them; TASK-104.12 made them release-blocking. Decide stable GPU or software-GL rendering conditions and tolerance as part of the work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A small set of scenes is compared against stored images in real Chromium with a documented tolerance
- [x] #2 The stability conditions (renderer, flags, platform) are documented
- [x] #3 The suite runs in CI or has a documented manual run
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Golden-image suite merged from impl/105.14 (bb78cb9): golden-image compare module, browser golden page, runner, README documenting renderer/flags/platform stability conditions and tolerance. Goldens are NOT committed. The golden-images CI job needs bootstrapping via workflow_dispatch with update_goldens before it can compare (AC #1 stays unchecked until goldens are stored). Hyphenated tags in templates (tiling-sprite, rounded-rect) now work via Renderer.knowsElement (f6fd4ee). Verified post-merge: core build ok; vitest core/renderer-pixi/testing 719 passed, 2 skipped.
<!-- SECTION:FINAL_SUMMARY:END -->
