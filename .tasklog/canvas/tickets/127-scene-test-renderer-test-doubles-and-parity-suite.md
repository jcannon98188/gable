---
kind: ticket
title: Scene test renderer, test doubles and parity suite
status: resolved
blocked_by: [122, 123, 124, 125]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.8 - Scene-test-renderer-test-doubles-and-parity-suite.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 246000
---

## Question

canvas/115: createSceneTestRenderer in the /testing entry, an in-memory tree with the real tags and Pixi property semantics and no Pixi, plus deterministic fixture.frame(dt), simulated pointer, keyboard and gamepad via service doubles, provideTestAssets with scriptable bundle states, one mountApp fixture exposing fixture.scene beside fixture.root, Renderer.destroy and boundary layering support.

## Acceptance criteria

- [x] #1 Scene test renderer passes defineRendererConformance
- [x] #2 A parity suite builds the same templates with real Pixi in Node (excluding Text and rendering) and compares properties and child order with the test renderer
- [x] #3 fixture.scene.find returns plain data for position, visibility, alpha, texture, children, with draw order including zIndex
- [x] #4 scene.pointer, scene.keyboard, scene.gamepad and fixture.frame drive the same code paths as production
- [x] #5 provideTestAssets scripts loading, progress and failure, and asserts bundle release on scope disposal
- [x] #6 A HUD click in the DOM tree can be asserted on a scene node in one fixture

## Answer

Added the scene test renderer to @gablejs/renderer-pixi/testing: a pixi-free Pixi-shaped renderer sharing the tag/property table, run through defineRendererConformance; fixture.scene.find returns plain data (position, visibility, alpha, texture, children, draw order with zIndex); fixture.frame(dt)/frames(n, dt) drive the real Frame loop (dt clamped like production); scene.pointer/keyboard/gamepad drive the real services from simulated sources; provideTestAssets() scripts bundle loading, progress and failure with expectReleased(); mountWithScene joins a DOM fixture and a scene through shared signals (HUD click -> scene assertion); [a11y] nodes feed the A11yMirror/A11yRecorder, exposed as scene.a11y/focus/tab/press/click. A Node parity suite builds the same templates with real Pixi and the test renderer and compares properties, child order and anchors (text and rendering excluded; hyphenated tags via the renderer API). The parity suite exposed and fixed a bug in the Pixi renderer's insert (a whitespace text node or shape named as 'before' appended instead of inserting, breaking @for reorders). Verified after merge (integration 630e994): five-package run 80 files/941 tests with only two just-added a11y tests failing, fixed and rerun green for scene-test (66 tests); the full five-package suite is rerun at the next merge. Notes: frame(100) runs three clamped steps (use frames(2, 50) for six); importing the Assets double loads pixi.js transitively.
