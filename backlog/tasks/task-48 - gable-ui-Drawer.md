---
id: TASK-48
title: 'gable-ui: Drawer'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:38:00Z'
labels:
  - ui
dependencies: []
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Drawer (vaul) is a swipe-to-dismiss bottom sheet. Sheet covers edge panels but not drag gestures and snap points, and Zag has no drawer machine. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Drawer opens from an edge and can be dragged closed with pointer or touch
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. DrawerDragEngine + useDrawerDrag/uiDrawerDrag in ui-primitives (drawer-drag.ts), simulated-pointer tests. 2. ui-drawer on Dialog state with uiDrawerDrag on the panel, snapPoints, [(snap)]. 3. registry-meta, index, docs. 4. Gallery drawer.html demo + test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented packages/ui-primitives/src/drawer-drag.ts (engine, useDrawerDrag, uiDrawerDrag), packages/ui/src/components/drawer.ts (+ drawer.dom.test.ts), gallery page examples/ui-gallery/drawer.html. vitest packages/ui packages/ui-primitives: 264 passed; tsc build for both packages clean. Gallery demo test passes only against workspace sources (needs npm run pack:local for the vendored @gable/ui). AC1 and AC3 left unchecked: drag verified only with simulated pointer events in jsdom, not in a real browser or touch device; gallery page not yet viewed in a browser.
<!-- SECTION:NOTES:END -->
