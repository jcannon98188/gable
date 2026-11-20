---
kind: ticket
title: "Editor: bubble toolbar positioning"
status: resolved
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.12 - Editor-bubble-toolbar-positioning.md
ordinal: 157000
---

## Question

In the demo the floating selection toolbar renders at the top-left of the page: it is absolutely positioned with no positioned ancestor and computed from getBoundingClientRect of the wrong element. It also never flips or clamps near the edges.

## Acceptance criteria

- [x] #1 Bubble toolbar appears just above the selection, inside the editor, and follows the selection
- [x] #2 It flips below the selection when there is no room above and is clamped to the editor width
- [x] #3 Verified in a real browser; covered by a unit test of the placement function

## Implementation notes

Frame is now position:relative; pure placeBubble() (above, flip below, clamp) in bubble-position.ts with unit tests. Verified in a real browser against the demo: bubble sits ~9px above the selection, left-aligned, inside the frame.

## Answer

Bubble toolbar appears next to the selection instead of the page corner.
