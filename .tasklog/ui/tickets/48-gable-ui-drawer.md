---
kind: ticket
title: "gable-ui: Drawer"
status: open
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-48 - gable-ui-Drawer.md
assignee:
  - '@claude'
ordinal: 89000
---

## Question

shadcn's Drawer (vaul) is a swipe-to-dismiss bottom sheet. Sheet covers edge panels but not drag gestures and snap points, and Zag has no drawer machine. Deferred from ui/28.

## Acceptance criteria

- [ ] #1 Drawer opens from an edge and can be dragged closed with pointer or touch
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery

## Implementation plan

1. DrawerDragEngine + useDrawerDrag/uiDrawerDrag in ui-primitives (drawer-drag.ts), simulated-pointer tests. 2. ui-drawer on Dialog state with uiDrawerDrag on the panel, snapPoints, [(snap)]. 3. registry-meta, index, docs. 4. Gallery drawer.html demo + test.

## Implementation notes

Implemented packages/ui-primitives/src/drawer-drag.ts (engine, useDrawerDrag, uiDrawerDrag), packages/ui/src/components/drawer.ts (+ drawer.dom.test.ts), gallery page examples/ui-gallery/drawer.html. vitest packages/ui packages/ui-primitives: 264 passed; tsc build for both packages clean. Gallery demo test passes only against workspace sources (needs npm run pack:local for the vendored @gable/ui). AC1 and AC3 left unchecked: drag verified only with simulated pointer events in jsdom, not in a real browser or touch device; gallery page not yet viewed in a browser.

Second pass: Escape/button close from a snap point below full now slides out from the resting transform (handle.exit(), data-dragged); backdrop opacity follows drag progress (progress output -> ui-drawer backdrop style); snap changes while open animate. jsdom tests added. Real-browser feel of the animations still unverified (ACs needing a browser stay unchecked).
