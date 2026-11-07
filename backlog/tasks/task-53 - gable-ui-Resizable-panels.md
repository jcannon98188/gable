---
id: TASK-53
title: 'gable-ui: Resizable panels'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:59:00Z'
labels:
  - ui
dependencies: []
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Resizable wraps react-resizable-panels. Zag has a splitter machine that should map onto it. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Resizable panel group with draggable and keyboard-operable handles, horizontal and vertical
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ResizeEngine primitive (resize.ts): percent sizes, min/max, collapse, drag + ARIA splitter keys. 2. ui-resizable-panel-group/panel/handle in resizable.ts with [(layout)] and autoSaveId (guarded localStorage). 3. Tests: primitive unit, in-memory, jsdom (pointer, keys, persistence, axe). 4. registry-meta, docs section, gallery page resizable.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. vitest packages/ui packages/ui-primitives: all pass except calendar.dom.test.ts date-picker axe (other agent's work). tsc -p tsconfig.build.json clean for ui and ui-primitives. Gallery page examples/ui-gallery/resizable.html needs npm run pack:local to run; its demo test was verified only by temporarily running it against packages/ui source, not in a browser. Real pointer dragging in a browser (layout, pointer capture) not verified; jsdom uses mocked rects. Limits: handles move neighbours only; panels matched to handles by creation order.

Second pass: panels and handles are now matched by document order (compareDocumentPosition, re-read on contentChildren change and via a childList MutationObserver), so @if/@for panels added mid-group are placed correctly (resizable-order.dom.test.ts). ResizeEngine cascades a drag or arrow key into the next panel when the neighbour is at its minimum (Home/End/infinite deltas do not); RTL option mirrors drags and arrows for horizontal groups, detected from dir on the group or an ancestor. Engine tests added (resize.test.ts, 25). Browser verification still outstanding (TASK-62).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ResizeEngine (ui-primitives/resize.ts) and ui-resizable-panel-group/panel/handle (ui/components/resizable.ts): horizontal/vertical, percent sizes with min/max, collapsible panels, pointer drag and ARIA window-splitter keyboard, [(layout)] model and autoSaveId localStorage persistence. Tests: engine unit, in-memory, jsdom incl. axe. Gallery page added but AC3 left unchecked: not run in a browser (needs pack:local).
<!-- SECTION:FINAL_SUMMARY:END -->
