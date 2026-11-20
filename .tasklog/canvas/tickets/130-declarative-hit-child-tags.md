---
kind: ticket
title: "Declarative hit-* child tags"
status: resolved
blocked_by: [124]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.11 - Declarative-hit-child-tags.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 249000
---

## Question

canvas/113 deferred declarative hit areas; canvas/117 made them release-blocking. They use the same attachment-child pattern as graphics shapes.

## Acceptance criteria

- [x] #1 Hit-shape child tags set a node's hitArea declaratively and update with signals
- [x] #2 Element map, test renderer and docs cover them

## Answer

Added declarative hit-* child tags (hit-rect, hit-circle, hit-ellipse, hit-polygon, hit-rounded-rect) that set the parent's hitArea and update with signals. Multiple hit children combine as a union. While a node has hit-* children they win over an explicit [hitArea] property; the explicit value is remembered and restored when the last hit child is removed (renderer.ts applyHitArea/explicitHitArea). Element map, scene-test renderer (hit-tags tests) and docs/canvas-hit-areas.md cover them; language-service scene conformance updated. Reconciled with the existing hook: impl/105.11 added Renderer.isNativeTag duplicating Renderer.knowsElement; kept knowsElement only (core renderer.ts/view.ts, Pixi and scene-test renderers; knowsElement now also covers hit tags) and removed isNativeTag. Verified: core/testing/renderer-pixi/language-service builds clean; vitest over core, renderer-pixi, testing, language-service passed (933 passed, 2 skipped).
