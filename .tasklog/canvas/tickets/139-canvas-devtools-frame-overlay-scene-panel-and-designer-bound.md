---
kind: ticket
title: "Canvas devtools: frame overlay, Scene panel and Designer boundary support"
status: resolved
blocked_by: [123]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.20 - Canvas-devtools-frame-overlay-Scene-panel-and-Designer-boundary-support.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 258000
---

## Question

canvas/119: a dev-only frame overlay (debug attribute on <gable-canvas> or provideCanvasDebug()), a Scene panel in the browser devtools extension showing the display-object tree with source locations and the last flush's effects (reusing @gablejs/core/devtools flush records and why-reports), and Designer preview-agent support for a renderer boundary.

## Acceptance criteria

- [x] #1 The overlay shows per-phase ms, rolling p50 and p95, dropped frames, display-object count and bindings re-run in the last frame
- [x] #2 The devtools extension shows the scene tree with source locations
- [x] #3 The Designer's preview agent reports a boundary's scene tree like a DOM tree
- [x] #4 None of it ships in production builds

## Answer

Added a dev-only canvas debug overlay (debug attribute on <gable-canvas> or provideCanvasDebug()): per-phase ms, rolling p50/p95, dropped frames, display-object count and bindings re-run per frame. Added a Scene tab to the devtools extension showing the display-object tree with source locations and the last flush's effects, and a sceneTree report in the Designer preview agent for renderer boundaries. Core gained a boundary hook (registerBoundary/pageRectOf in @gablejs/core devtools) and flushSync now returns the effect count. Dev-only code is excluded from production builds (debug-prod.test.ts). Verified after merge into integration/canvas-binding: core, testing, renderer-pixi, language-service, devtools-extension build clean; vitest over those packages passed (969 passed, 2 skipped). Risks/follow-ups: the Scene tab is unstyled in panel.css; the designer agent handler is only typechecked, not run in a browser.
