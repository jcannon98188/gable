---
id: TASK-105.22
title: Canvas author guide
status: Done
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T01:49:00Z'
labels: []
dependencies:
  - TASK-105.5
  - TASK-105.6
  - TASK-105.9
  - TASK-105.16
  - TASK-105.19
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 260000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The decisions in TASK-104.3, .6, .8, .9, .11, .13 and .14 define patterns authors must follow; document them: entities as components and state in services, the Frame service, input services and DOM rules, assets and loading UI, the accessibility checklist, HMR rules (avoid #private in hot-edited classes, no raw timers), and the performance tiers with measured counts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The site has a canvas guide covering each topic with a runnable example
- [x] #2 The accessibility checklist from TASK-104.11 is included
- [x] #3 Budgets quote the published measured numbers
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the canvas author guide: docs/canvas.md (entities as components with state in services, Frame service, input services and DOM rules, assets and loading UI, the TASK-104.11 accessibility checklist, HMR rules, performance tiers quoting the published measured numbers), runnable examples in packages/renderer-pixi/src/guide/ with per-topic tests, and site registration in site/src/docs/content.ts (canvas guide pages). guide-sync.test.ts verifies docs/canvas.md embeds the example files verbatim, so the code readers copy is the code the tests run. Verification on integration/canvas-binding: rebuilt core, renderer-pixi, vite; root vitest for packages/renderer-pixi and packages/core passed (442 passed, 2 skipped). Site docs tests (site/src/docs) were run and passed (33 tests), but they have no canvas-specific assertions, so guide registration and rendering are not directly asserted by them.
<!-- SECTION:FINAL_SUMMARY:END -->
