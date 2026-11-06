---
id: TASK-9
title: Add a js-framework-benchmark implementation as examples/js-framework-benchmark
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:35'
updated_date: '2026-11-06 03:44'
labels:
  - example
  - performance
dependencies: []
priority: medium
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable has no performance numbers. krausest/js-framework-benchmark is the standard keyed-table benchmark (create 1k/10k rows, partial update, swap, select, remove, append, clear). A Gable implementation exercises @for with track, signal updates and DOM patching, and can be dropped into that repo later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/js-framework-benchmark implements the benchmark's required UI contract (ids/classes/buttons) with Gable and builds with Vite
- [x] #2 A local script runs the standard operations in a real browser and prints timings
- [x] #3 README explains how to run it and how to submit it to the upstream benchmark
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read upstream UI contract (vanilla/solid keyed) and mirror todomvc conventions (vendor tarballs via pack:local).
2. Build examples/js-framework-benchmark: RowStore service, App and tr[app-row] components, @for track row.id, upstream CSS in public/.
3. Tests on the in-memory renderer; tsc + gable-check + vite build.
4. scripts/bench.mjs: build, vite preview, Playwright (installed Chrome/Edge) running the standard ops, median timings with DOM verification.
5. README: run instructions and upstream submission steps; vite.upstream.config.ts + upstream/index.html for the dist/main.js layout.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Bench (Edge 156, 10 fresh-page iterations, median click-to-paint): create1k 126ms, replace1k 231ms, update10th 26ms, select 18ms, swap 65ms, remove 30ms, create10k 1015ms, append1k 111ms, clear 79ms. Finding: @for moves ~all rows on a swap (1994 childList mutations) because it keeps only rows whose previous position stays increasing (greedy, not LIS) in packages/core/src/view.ts. Verified: tsc, gable-check, vitest (2 tests), vite build, upstream iife build runs in browser (10k rows, no page errors).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added examples/js-framework-benchmark: Gable keyed implementation of the krausest UI contract (RowStore, App, tr[app-row] row component, @for track row.id), upstream CSS, vitest contract tests, scripts/bench.mjs (build + vite preview + Playwright on installed Chrome/Edge, DOM-verified median timings), README with run and upstream-submission steps, plus vite.upstream.config.ts/upstream/index.html for the dist/main.js layout. Verified with tsc, gable-check, vitest (2 pass), vite build, and a bench run printing timings for all 9 operations. Upstream submission steps are documented but not executed against the upstream repo.
<!-- SECTION:FINAL_SUMMARY:END -->
