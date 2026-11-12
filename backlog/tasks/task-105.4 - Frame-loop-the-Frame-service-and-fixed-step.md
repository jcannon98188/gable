---
id: TASK-105.4
title: Frame loop, the Frame service and fixed step
status: To Do
assignee: []
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T21:47:00Z'
labels: []
dependencies:
  - TASK-105.3
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0020 and TASK-104.6: one Gable-owned rAF loop per boundary with the Pixi ticker off; per frame the hooks run, then a synchronous effect flush, then one render. Variable dt clamped to about 50 ms, opt-in onFixedStep(hz, cb) with the accumulator kept in the Frame service, renderMode 'on-demand', hooks tied to scope via onCleanup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 inject(Frame).onFrame(dt => ...) registers a hook that is removed with its component scope
- [ ] #2 Order is hooks, synchronous flush, one render, each frame
- [ ] #3 dt is clamped; onFixedStep accumulates so 100 ms yields six 60 Hz steps
- [ ] #4 renderMode='on-demand' renders only after a change
- [ ] #5 A rebuild mid-frame takes effect at the next frame; accumulators survive rebuilds
- [ ] #6 Tests run against the test renderer without real timers
<!-- AC:END -->
