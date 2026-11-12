---
id: TASK-105.19
title: Canvas benchmark example and CI regression gate
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:46:00Z'
labels: []
dependencies:
  - TASK-105.4
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 257000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: productionise the spike's benchmark page and Playwright driver (prototypes/pixi-renderer on prototype/pixi-renderer-spike) as examples/canvas-benchmark. Every PR runs the Node microbench; CI runs headless Chromium and gates on relative regression of JS-side phases against a baseline measured on the same runner. Absolute budgets are never gated on CI hardware.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/canvas-benchmark measures hooks, flush and render phases and frame percentiles for the update styles at several entity counts
- [x] #2 CI fails when a JS-side phase is more than 15 percent worse than the same-runner baseline
- [x] #3 The Node microbench runs on every PR
- [x] #4 Real-GPU results on the reference machine go to a results file
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added examples/canvas-benchmark: measures hooks, flush, render and total JS per frame plus frame-time p50/p95/p99 and dropped frames for styles signals, shared, ref and particles at configurable entity counts (phases measured from outside the renderer by wrapping Frame.advance and Application.render); a Node microbench (npm run bench:canvas:micro, structure-only assertions) runs on every PR in the build-test job; a canvas-benchmark CI job builds the page against the base commit's packages and the PR's, measures both on the same runner (5 repetitions) and fails above +15% (0.1 ms noise floor) via scripts/compare.mjs (7 unit tests); npm run bench:gpu writes results/real-gpu.json (OS, CPU, WebGL renderer) for the reference machine. Verified after merge (integration 10392db): microbench 8/8, gate tests 7/7, core/renderer-pixi/testing 594 tests pass. Gaps: GitHub Actions job not yet run (thresholds may need tuning on ubuntu-latest); no reference-machine numbers committed yet (manual step before release); full matrix not run locally.
<!-- SECTION:FINAL_SUMMARY:END -->
