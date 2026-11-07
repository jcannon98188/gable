---
id: TASK-67
title: 'ui-gallery: tsc clean after pack:local refresh'
status: Done
assignee: []
created_date: '2026-11-07T05:01:00Z'
updated_date: '2026-11-07T05:42:00Z'
labels:
  - ui
dependencies: []
priority: medium
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/ui-gallery tsc fails only because vendored @gable/ui tarball is stale (missing UiCarousel, UiCommand, etc., menu item kinds). Re-run npm run pack:local examples/ui-gallery and re-check tsc.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tsc gallery/todomvc/jfb against current tarballs; 2. fix example errors; library gaps -> new task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
gallery tsc now has a single error: gallery.scenes.ts imports ComponentScenes from @gable/core/tooling, which the vendored core tarball lacks (added in 8d231c5, after the tarballs were packed). todomvc has the same two stale-tarball errors (ComponentScenes, mountScene); js-framework-benchmark clean. No source fix needed: needs one pack:local refresh, then re-run tsc. Added 'typecheck' npm script (tsc --noEmit) to examples/ui-gallery.

After pack:local and clean reinstall, gallery and todomvc tsc are clean; gallery vitest 18 files / 27 tests pass.
<!-- SECTION:NOTES:END -->
