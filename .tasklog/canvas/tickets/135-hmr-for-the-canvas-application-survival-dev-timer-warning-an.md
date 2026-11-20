---
kind: ticket
title: "HMR for the canvas: Application survival, dev timer warning and soak tests"
status: resolved
blocked_by: [122, 123]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.16 - HMR-for-the-canvas-Application-survival-dev-timer-warning-and-soak-tests.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 254000
---

## Question

canvas/118: <gable-canvas> keeps its Application and renderer in hotData so host and provider edits do not recreate the GL context; the dev build warns when a component registers a raw setInterval or setTimeout without onCleanup; release-gate tests close the spike's unmeasured gaps.

## Acceptance criteria

- [x] #1 Editing the host class or adding a field to a root service keeps the same Application and GL context
- [x] #2 The dev warning fires for raw timers without onCleanup
- [x] #3 A soak script runs 200 or more edits with forced GC and records heap and Pixi resource growth
- [x] #4 Tests cover a real setInterval in a field versus a service, a non-cyclic field transfer, a useValue service and direct applyUpdate

## Answer

HMR for the canvas: the scene renderer and its Pixi Application are held through hotData and survive host-class and root-service edits (orphaned renderer pooled for 200 ms awaiting a replacement scene; rehost() moves the canvas and resize observer); dev-only warning for raw setInterval/setTimeout started in a component's Setup without onCleanup (opt-in per renderer via Renderer.warnRawTimers; services exempt); isHotUpdating() core export. Soak (npm run soak -w packages/renderer-pixi, 240 edits, forced GC): ~17 KB heap/edit, 62 nodes flat, 1 Application, timers/hooks flat. The soak also found and fixed a core HMR leak (packages/core/src/hmr.ts kept the replaced record alive per generation; ~120 KB -> 17 KB per edit). Tests: hmr.test.ts, hmr-state.test.ts, hmr-timers.test.ts, soak/hmr-soak.test.ts. Verified after merge (integration 17bed27): core 96, testing 370, renderer-dom 70, language-service 172, renderer-pixi 169/170 (the soak test only passes with --expose-gc via npm run soak; the root vitest config does not include soak/). Limits: timers started after Setup (methods/handlers) are not detected; replacement scenes slower than 200 ms to build lose the Application; under jsdom 'Pixi resources' means JS-side scene objects plus the Application count.
