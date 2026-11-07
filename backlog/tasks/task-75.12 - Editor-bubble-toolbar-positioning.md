---
id: TASK-75.12
title: 'Editor: bubble toolbar positioning'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:56:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the demo the floating selection toolbar renders at the top-left of the page: it is absolutely positioned with no positioned ancestor and computed from getBoundingClientRect of the wrong element. It also never flips or clamps near the edges.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Bubble toolbar appears just above the selection, inside the editor, and follows the selection
- [x] #2 It flips below the selection when there is no room above and is clamped to the editor width
- [x] #3 Verified in a real browser; covered by a unit test of the placement function
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frame is now position:relative; pure placeBubble() (above, flip below, clamp) in bubble-position.ts with unit tests. Verified in a real browser against the demo: bubble sits ~9px above the selection, left-aligned, inside the frame.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bubble toolbar appears next to the selection instead of the page corner.
<!-- SECTION:FINAL_SUMMARY:END -->
