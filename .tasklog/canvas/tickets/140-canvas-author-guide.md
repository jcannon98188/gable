---
kind: ticket
title: Canvas author guide
status: resolved
blocked_by: [124, 125, 128, 135, 138]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.22 - Canvas-author-guide.md
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 260000
---

## Question

The decisions in canvas/108, .6, .8, .9, .11, .13 and .14 define patterns authors must follow; document them: entities as components and state in services, the Frame service, input services and DOM rules, assets and loading UI, the accessibility checklist, HMR rules (avoid #private in hot-edited classes, no raw timers), and the performance tiers with measured counts.

## Acceptance criteria

- [x] #1 The site has a canvas guide covering each topic with a runnable example
- [x] #2 The accessibility checklist from canvas/116 is included
- [x] #3 Budgets quote the published measured numbers

## Answer

Added the canvas author guide: docs/canvas.md (entities as components with state in services, Frame service, input services and DOM rules, assets and loading UI, the canvas/116 accessibility checklist, HMR rules, performance tiers quoting the published measured numbers), runnable examples in packages/renderer-pixi/src/guide/ with per-topic tests, and site registration in site/src/docs/content.ts (canvas guide pages). guide-sync.test.ts verifies docs/canvas.md embeds the example files verbatim, so the code readers copy is the code the tests run. Verification on integration/canvas-binding: rebuilt core, renderer-pixi, vite; root vitest for packages/renderer-pixi and packages/core passed (442 passed, 2 skipped). Site docs tests (site/src/docs) were run and passed (33 tests), but they have no canvas-specific assertions, so guide registration and rendering are not directly asserted by them.
