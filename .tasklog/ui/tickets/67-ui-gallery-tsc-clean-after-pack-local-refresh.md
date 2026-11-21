---
kind: ticket
title: "ui-gallery: tsc clean after pack:local refresh"
status: resolved
tags:
  - ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-67 - ui-gallery-tsc-clean-after-pack-local-refresh.md
priority: medium
ordinal: 115000
---

## Question

examples/ui-gallery tsc fails only because vendored @gablejs/ui tarball is stale (missing UiCarousel, UiCommand, etc., menu item kinds). Re-run npm run pack:local examples/ui-gallery and re-check tsc.

## Implementation plan

1. tsc gallery/todomvc/jfb against current tarballs; 2. fix example errors; library gaps -> new task.

## Answer

gallery tsc now has a single error: gallery.scenes.ts imports ComponentScenes from @gablejs/core/tooling, which the vendored core tarball lacks (added in 8d231c5, after the tarballs were packed). todomvc has the same two stale-tarball errors (ComponentScenes, mountScene); js-framework-benchmark clean. No source fix needed: needs one pack:local refresh, then re-run tsc. Added 'typecheck' npm script (tsc --noEmit) to examples/ui-gallery.

After pack:local and clean reinstall, gallery and todomvc tsc are clean; gallery vitest 18 files / 27 tests pass.
