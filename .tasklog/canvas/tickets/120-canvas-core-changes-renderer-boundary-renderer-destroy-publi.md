---
kind: ticket
title: ">-\n  Canvas core changes: renderer boundary, Renderer.destroy, public flush,\n  onCleanup, hotData"
status: resolved
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.1 - Canvas-core-changes-renderer-boundary-Renderer.destroy-public-flush-onCleanup-hotData.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 239000
---

## Question

The canvas binding needs five small additive changes to @gable/core, decided in canvas/110, .6, .9, .12 and .13: a renderer boundary declared in static meta (ADR 0019), optional Renderer.destroy(), the synchronous flush pair (flushSync, whenFlushed) made public (main entry if safe, otherwise a new @gable/core/frame entry, never /internal), a public scope-cleanup hook onCleanup, and a dev-only hotData(key, create) primitive so a component's non-copyable resource survives hot edits. The spike branch prototype/pixi-renderer-spike has a working first cut of the boundary, destroy and onCleanup in packages/core/src/component.ts to start from.

## Acceptance criteria

- [x] #1 meta.renderer declares a renderer boundary: template and projected slot content build with the boundary renderer, sharing the host scope and injector, per ADR 0019
- [x] #2 Renderer.destroy is optional and is called when a boundary host is destroyed
- [x] #3 flushSync and whenFlushed are importable from a public entry point, not /internal
- [x] #4 onCleanup registers a callback run when the calling scope is disposed
- [x] #5 hotData(key, create) returns the stored value for the component identity in dev and just calls create in production
- [x] #6 All existing core tests pass unchanged and each new API has tests

## Answer

Added the five additive core changes in @gable/core: meta.renderer boundary (host in the parent renderer; template and projected slots built with the boundary renderer; shared injector and scope; boundary providers layered as a child injector), optional Renderer.destroy called on boundary host destroy, flushSync/whenFlushed exported from the main entry, onCleanup, and dev-only hotData(key, create) paired through the existing hot-update instance pairing. Tests: packages/testing/src/canvas-core.test.ts. Verified after merge (integration cec96c4): core 96/96, testing 344 tests pass; only hmr-review.test.ts fails (@gable/vite unbuilt, pre-existing). Notes: tests were written after the implementation, not strictly test-first; renderer-dom browser.test.ts not run (known failing).
