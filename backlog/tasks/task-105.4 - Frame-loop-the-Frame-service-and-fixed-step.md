---
id: TASK-105.4
title: Frame loop, the Frame service and fixed step
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T23:35:00Z'
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
- [x] #1 inject(Frame).onFrame(dt => ...) registers a hook that is removed with its component scope
- [x] #2 Order is hooks, synchronous flush, one render, each frame
- [x] #3 dt is clamped; onFixedStep accumulates so 100 ms yields six 60 Hz steps
- [x] #4 renderMode='on-demand' renders only after a change
- [x] #5 A rebuild mid-frame takes effect at the next frame; accumulators survive rebuilds
- [x] #6 Tests run against the test renderer without real timers
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Frame loop and Frame service in packages/renderer-pixi: Gable-owned rAF loop (injectable scheduler) running hooks, then flushSync, then one render (ADR 0020); Frame service with onFrame and onFixedStep(hz, cb(dt, alpha)), hooks removed with their scope, clamped dt (MAX_FRAME_DT 0.05 s), fixed-step accumulators keyed by rate and surviving rebuilds; renderMode ('always' default, 'on-demand' with invalidate()); <gable-canvas> renderMode input; loop stops on host destroy; loop errors are logged and the loop continues. Tests: frame.test.ts, frame-loop.test.ts. Verified after merge (integration 2e875ad): renderer-pixi 110/110, core 96/96, renderer-dom 70/70; only hmr-review.test.ts fails (known). Note: scene components projected into <gable-canvas> from a page cannot inject Frame or CanvasSize (projected content resolves in the declaring injector, consistent with ADR 0019/TASK-104.5); scene components belong in a host component's own template - to be stated in the author guide.
<!-- SECTION:FINAL_SUMMARY:END -->
