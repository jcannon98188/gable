---
id: TASK-71
title: 'gable-ui: Tree view (with virtualized mode)'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T05:05:00Z'
updated_date: '2026-11-07T05:15:00Z'
labels:
  - ui
  - gable-ui
dependencies: []
priority: high
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported missing while dogfooding: a tree view for file-explorer style UIs, inspectors and nested navigation. Build on @zag-js/tree-view if it fits (else native), ARIA role=tree/treeitem with aria-expanded/selected/level/setsize/posinset, expand/collapse, single and multi selection, keyboard (arrows, Home/End, *, type-ahead, Enter/Space), roving focus, data items rendered recursively with @for (no template holes, see docs/ui-items.md). Large trees: a virtualized mode that flattens visible nodes and composes with useVirtualizer (TASK-44).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tree with expand/collapse, selection (single and multi), full keyboard support and correct ARIA tree semantics
- [x] #2 Virtualized mode renders only visible nodes for 10,000+ node trees
- [x] #3 One file in packages/ui/src/components with registry-meta entry, tests (in-memory, jsdom, axe)
- [ ] #4 Shown in examples/ui-gallery on its own page
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Native tree (no @zag-js/tree-view installed; flattened model suits virtualization). 2. Flatten visible nodes, roving focus, keyboard, selection, lazy children, useVirtualizer mode. 3. Tests (in-memory, jsdom, axe, 10k perf). 4. Docs and gallery page tree.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: native implementation, @zag-js/tree-view not installed and no package.json/lockfile edits. packages/ui/src/components/tree.ts (UiTree, flattenTree, expandableIds), tree.test.ts (in-memory), tree.dom.test.ts (jsdom, axe, 10,100-node virtual window, End/Home focus and scrollToIndex, flatten perf, 20k deep chain). Gallery: examples/ui-gallery/tree.html + src/tree-main.ts/tree-demo.ts/tree-demo.test.ts (test passes against source via aliases; gallery itself needs npm run pack:local before its own vitest/dev sees the new components). AC4 left unchecked: not viewed in a real browser; needs pack:local then npm run dev.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ui-tree (native; flattened visible nodes; roving focus, full keyboard, single/multiple selection, lazy children, row actions, virtual mode via useVirtualizer with per-level aria-setsize/posinset). Verified: vitest packages/ui packages/ui-primitives packages/gable-ui 61 files / 456 tests pass; tsc -p tsconfig.build.json clean for ui and ui-primitives; axe clean. Not verified in a real browser (AC4); gallery needs pack:local. Not covered: checkbox trees, drag reorder, variable row height in virtual mode.
<!-- SECTION:FINAL_SUMMARY:END -->
