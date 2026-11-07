---
id: TASK-75.12
title: 'Editor: bubble toolbar positioning'
status: To Do
assignee: []
created_date: '2026-11-07T15:21:00Z'
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
- [ ] #1 Bubble toolbar appears just above the selection, inside the editor, and follows the selection
- [ ] #2 It flips below the selection when there is no room above and is clamped to the editor width
- [ ] #3 Verified in a real browser; covered by a unit test of the placement function
<!-- AC:END -->
