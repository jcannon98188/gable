---
kind: ticket
title: Pixi renderer and the gable-canvas host
status: resolved
blocked_by: [120, 121]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.3 - Pixi-renderer-and-the-gable-canvas-host.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 241000
---

## Question

The renderer and DOM-hosted component from canvas/110 and 104.7: a Renderer<N> over Pixi 8 display objects with retained-mode property writes, the extensible tag registry (unregistered hyphenated tag is a component host, unhyphenated is a dev error), zIndex sorting, masks via refs, filters, graphics shapes redrawn once per frame, static attribute conversion, canvas size as an injected signal service, and the host's labelling defaults. Pixi loads through a dynamic import on first mount (canvas/117). The spike branch has a working first version to start from.

## Acceptance criteria

- [x] #1 pixiRenderer(options) works as meta.renderer for <gable-canvas>, and scene content renders on a real canvas
- [x] #2 Signal writes update only the changed Pixi property; dotted paths like [scale.x] work
- [x] #3 pixi.js is loaded by dynamic import on first mount and a placeholder shows while it loads
- [x] #4 The host is a role=group element labelled from aria-label or aria-labelledby
- [x] #5 Scene HMR keeps the Application; destroying the host calls Renderer.destroy and leaves no leaked Pixi objects
- [x] #6 Tests cover tag registry errors, ordering, shapes, masks and filters

## Answer

Added the Pixi renderer and the <gable-canvas> host in packages/renderer-pixi: pixiRenderer(options) as meta.renderer; Gable-owned minimal render loop (flushSync, renderer.frame, app.render on rAF; canvas/123 replaces it with the Frame service); retained-mode property writes with dotted paths; extensible tag registry (registerTag), strict property errors, shapes, masks, filters; host split into a pixi-free <gable-canvas> and a lazily imported scene component with a placeholder (slot=placeholder override); role=group host with aria-label/labelledby; CanvasSize service (width, height, pixelRatio signals). Tests: renderer.test.ts (26), host.test.ts (13), browser.test.ts (real headless Chromium/SwiftShader pixel readback, skips when no Chromium). Verified after merge (integration 09ff220): 57/58 files, 601 tests; only hmr-review.test.ts fails (known). Notes: HMR criterion verified by rebuilding the scene subtree (Application created once, never destroyed), not by a real hot-update runtime (canvas/135 owns the soak); components projected into <gable-canvas> are built in the declaring component's injector so they cannot inject CanvasSize directly (services provided above the host work) - flagged for review against ADR 0019.
