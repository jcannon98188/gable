---
id: TASK-105.3
title: Pixi renderer and the gable-canvas host
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:46:00Z'
updated_date: '2026-11-12T23:26:00Z'
labels: []
dependencies:
  - TASK-105.1
  - TASK-105.2
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer and DOM-hosted component from TASK-104.5 and 104.7: a Renderer<N> over Pixi 8 display objects with retained-mode property writes, the extensible tag registry (unregistered hyphenated tag is a component host, unhyphenated is a dev error), zIndex sorting, masks via refs, filters, graphics shapes redrawn once per frame, static attribute conversion, canvas size as an injected signal service, and the host's labelling defaults. Pixi loads through a dynamic import on first mount (TASK-104.12). The spike branch has a working first version to start from.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 pixiRenderer(options) works as meta.renderer for <gable-canvas>, and scene content renders on a real canvas
- [x] #2 Signal writes update only the changed Pixi property; dotted paths like [scale.x] work
- [x] #3 pixi.js is loaded by dynamic import on first mount and a placeholder shows while it loads
- [x] #4 The host is a role=group element labelled from aria-label or aria-labelledby
- [x] #5 Scene HMR keeps the Application; destroying the host calls Renderer.destroy and leaves no leaked Pixi objects
- [x] #6 Tests cover tag registry errors, ordering, shapes, masks and filters
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Pixi renderer and the <gable-canvas> host in packages/renderer-pixi: pixiRenderer(options) as meta.renderer; Gable-owned minimal render loop (flushSync, renderer.frame, app.render on rAF; TASK-105.4 replaces it with the Frame service); retained-mode property writes with dotted paths; extensible tag registry (registerTag), strict property errors, shapes, masks, filters; host split into a pixi-free <gable-canvas> and a lazily imported scene component with a placeholder (slot=placeholder override); role=group host with aria-label/labelledby; CanvasSize service (width, height, pixelRatio signals). Tests: renderer.test.ts (26), host.test.ts (13), browser.test.ts (real headless Chromium/SwiftShader pixel readback, skips when no Chromium). Verified after merge (integration 09ff220): 57/58 files, 601 tests; only hmr-review.test.ts fails (known). Notes: HMR criterion verified by rebuilding the scene subtree (Application created once, never destroyed), not by a real hot-update runtime (TASK-105.16 owns the soak); components projected into <gable-canvas> are built in the declaring component's injector so they cannot inject CanvasSize directly (services provided above the host work) - flagged for review against ADR 0019.
<!-- SECTION:FINAL_SUMMARY:END -->
