---
id: TASK-105.19
title: Canvas benchmark example and CI regression gate
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:35:00Z'
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
- [ ] #1 examples/canvas-benchmark measures hooks, flush and render phases and frame percentiles for the update styles at several entity counts
- [ ] #2 CI fails when a JS-side phase is more than 15 percent worse than the same-runner baseline
- [ ] #3 The Node microbench runs on every PR
- [ ] #4 Real-GPU results on the reference machine go to a results file
<!-- AC:END -->
