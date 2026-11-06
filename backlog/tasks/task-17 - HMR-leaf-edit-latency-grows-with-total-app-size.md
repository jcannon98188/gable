---
id: TASK-17
title: 'HMR: leaf edit latency grows with total app size'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:58'
updated_date: '2026-11-06 04:11'
labels:
  - performance
  - hmr
dependencies: []
priority: medium
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/hmr-benchmark: editing a leaf component costs about 45 ms at 500 components and about 165 ms at 2000, so some per-update work scales with the whole app instead of the edited component. Inner-component edits reach about 700 ms at 2000 components, and service edits about 1.4 s (rebuilding every injector is by design, but worth checking for avoidable cost). Profile where the time goes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Profile identifies what scales with total component count during a hot update, recorded in the task notes
- [x] #2 Leaf edit latency is roughly flat from 500 to 2000 components, or the remaining cause is documented with a justification
- [x] #3 State retention checks in examples/hmr-benchmark still pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline bench at 500/2000. 2. Profile a leaf and an inner edit: browser CPU profile via CDP and Node server profile via inspector (examples/hmr-benchmark/.work/profile.mjs, gitignored). 3. Fix avoidable client cost; document the rest.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Baseline (msedge headless, 8 iter, median ms; noisy machine): 500 leaf template 54 / 2000 leaf template 443 (README sample runs gave 44/167); 2000 inner template 695, inner class field 828, leaf service 1655. After: 500 leaf template 42, 2000 leaf 184; 2000 inner template 465, inner field 490, leaf service 880, inner service 824.
Profile of a 2000-component leaf edit: browser JS is ~10 ms (flat); the module request leaves the browser ~140 ms after the write vs ~40 ms at 500. Node profile of the dev server over that window: Vite's chokidar re-reads the edited file's directory (readdirp _read + lstat per file, filterPath/picomatch): 113 ms at 2000 files vs 25 ms at 500. All N generated components live in one src/ dir, so this is O(files in directory) inside Vite, not Gable. Not fixable in Gable; real apps spread files over directories; documented in the benchmark README.
Inner edits: the browser profile showed 556-700 ms in renderer-dom captureViewState, forced synchronous layout from reading scrollTop on every element of the old subtree. Fix: record scrolled elements from captured scroll events (trackScroll in packages/renderer-dom/src/view-state.ts) and read scroll offsets only for those; also made the walk iterative and ancestry strings lazy. jsdom test now dispatches a scroll event after setting scrollTop. Inner template 1138 -> 314 ms with scroll reads disabled in a profile run; full bench inner 695 -> 465. Service rebuild cost was dominated by the same capture. Remaining inner cost is rebuilding N/4 components (inherent).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Profiled: the leaf-edit growth is Vite's chokidar directory rescan (113 ms at 2000 files in one dir vs 25 ms at 500), documented as out of Gable's control; Gable's leaf work is flat. Found and fixed a real scaling cost in view-state capture (forced layout), cutting inner edits and service edits by about 30-45 percent. State retained in all benchmark rows; 349 tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
