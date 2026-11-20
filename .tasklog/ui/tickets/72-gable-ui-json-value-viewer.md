---
kind: ticket
title: "gable-ui: JSON / value viewer"
status: open
tags:
  - ui
  - gable-ui
  - in-progress
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-72 - gable-ui-JSON-value-viewer.md
assignee:
  - '@claude'
priority: medium
ordinal: 120000
---

## Question

Reported missing while dogfooding. A recipe-level component built on the Tree view: collapsible object/array nodes, type-coloured primitive values, key/value display, copy path and copy value, expand-all/collapse-all, large-value truncation, search/filter optional. Used by the devtools panel as a possible later consumer.

## Acceptance criteria

- [x] #1 Renders nested objects/arrays/primitives with collapse, copy path and copy value
- [x] #2 Handles large and cyclic data safely
- [x] #3 One file with registry-meta entry (registryDependencies: tree) and tests incl. axe
- [ ] #4 Shown in examples/ui-gallery

## Implementation notes

packages/ui/src/components/json-viewer.ts (UiJsonViewer, stringifyValue), registry-meta registryDependencies [tree]; json-viewer.dom.test.ts (6 tests incl. axe, copy path/value with mocked clipboard, cycle, depth limit, chunking of a 100,000 array, truncation). Built on UiTree via loadChildren (lazy). Shown on the same gallery page tree.html; AC4 unchecked: not viewed in a browser, needs pack:local.

## Final summary

Added ui-json-viewer on ui-tree: lazy child building, type-coloured primitives via theme tokens, copy path/value (guarded clipboard), expand/collapse all, truncation, maxDepth, [Circular], chunking [0..99]. Verified by jsdom tests incl. axe; docs in docs/ui-primitives.md. AC4 (gallery) unchecked: page exists (tree.html) but not viewed in a browser; needs pack:local. Not covered: search/filter.
