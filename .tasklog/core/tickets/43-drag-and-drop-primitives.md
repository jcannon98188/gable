---
kind: ticket
title: Drag and drop primitives
status: claimed
claimed_by: imported
blocked_by: [ui/25]
tags:
  - ui
  - dnd
  - ready-for-agent
  - in-progress
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-43 - Drag-and-drop-primitives.md
priority: medium
ordinal: 84000
---

## Question

A drag-and-drop layer in the style of Angular CDK / dnd-kit: draggable, drop containers, sortable lists (with keyboard support and live-region announcements), cross-container transfer, drag handle, auto-scroll and an overlay drag preview using the portal. Pointer-based (not HTML5 DnD) for consistent behaviour, with accessible keyboard alternatives. Build as primitives in @gable/ui-primitives with a Sortable component in gable-ui. Use a framework-agnostic library only if one fits; otherwise implement.

## Acceptance criteria

- [x] #1 Draggable, drop zone and sortable primitives with pointer and keyboard operation and screen-reader announcements
- [x] #2 Sortable list and kanban-style example in the ui-gallery, with jsdom and in-memory tests
- [ ] #3 Documented, and user has checked feel in a real browser

## Implementation plan

1. dnd-manager (sessions, hit test, preview in overlay root, auto-scroll, keyboard targets), dnd-announce (internal live region + messages), dnd (draggable, handle, drop zone), dnd-sortable (sortable, applySortableMove) in ui-primitives. 2. ui-sortable component + registry-meta. 3. Gallery /dnd.html page (sortable list, kanban, draggable+drop zone). 4. jsdom tests with mocked rects. 5. Docs section in docs/ui-primitives.md.

## Implementation notes

Implemented in packages/ui-primitives/src/dnd*.ts (exports added to index.ts), packages/ui/src/components/sortable.ts (UiSortableList, selector ui-sortable; registry-meta entry; grip-vertical icon added to lib/icon.ts), examples/ui-gallery/dnd.html + src/dnd-examples.ts + dnd-main.ts + dnd-examples.test.ts (separate page because the existing gallery test uses the in-memory renderer and these directives need a DOM; gallery.ts untouched; dev server only, not in vite build). No LiveAnnouncer existed, so dnd-announce.ts owns a minimal live region (documented). Tests: dnd.dom.test.ts (17), sortable.dom.test.ts (5), gallery dnd-examples.test.ts (1); npx vitest run packages/ui-primitives packages/ui passes (188), tsc clean on both packages, gallery vitest/tsc/vite build pass after pack:local. Limits: lists only vertical/horizontal, no grids; not tried in a real browser or with a screen reader.
