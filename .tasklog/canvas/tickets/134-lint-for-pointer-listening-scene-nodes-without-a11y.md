---
kind: ticket
title: "Lint for pointer-listening scene nodes without [a11y]"
status: resolved
blocked_by: [126, 128]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.15 - Lint-for-pointer-listening-scene-nodes-without-a11y.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 253000
---

## Question

canvas/116 named this lint as a follow-up; canvas/117 made it release-blocking. It is a template language-service rule.

## Acceptance criteria

- [x] #1 A rule with a stable id flags a scene node with a pointer listener and no [a11y]
- [x] #2 Severity is configurable like other rules
- [x] #3 Tests cover it

## Answer

Added the scene-pointer-a11y rule to the language service (packages/language-service/src/scene.ts, config.ts): flags scene nodes in scene templates (renderer boundary or marked scene component) that have a pointer-type listener (any SCENE_EVENTS event except wheel) and no [a11y] (static attribute or binding); reports on the tag name naming the first pointer event; component tags are never flagged. Default severity warn (does not fail gable-check); configurable to error (exit 1) or off through compilerOptions.plugins like the other rules. Tests: scene-a11y.test.ts (5, including the off case added at merge) with fixtures scene-a11y-fail, scene-a11y-off (error) and scene-a11y-disabled (off); scene-pass/scene-fail fixtures gained [a11y]. Verified after merge (integration d024005): root run of core, renderer-pixi, testing, language-service, renderer-dom, vite 87 files/993 tests pass (1 skipped).
