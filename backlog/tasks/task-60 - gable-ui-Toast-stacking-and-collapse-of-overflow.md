---
id: TASK-60
title: 'gable-ui: Toast stacking and collapse of overflow'
status: In Progress
assignee: []
created_date: '2026-11-07T04:57:00Z'
updated_date: '2026-11-07T05:31:00Z'
labels:
  - ui
dependencies: []
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ui-toaster only hides toasts beyond limit. Add a Sonner-style stacked/collapsed presentation that expands on hover or focus, with a hidden-count indicator. Follow-up from TASK-47.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Overflow toasts collapse into a stack and expand on hover/focus
- [x] #2 Timers stay paused while expanded
- [x] #3 jsdom tests and axe pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Stack presentation in ui-toaster (collapsed grid stack, expand on hover/focus, +N more). 2. jsdom tests in toast-stack.dom.test.ts. 3. Docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in toast.ts (stack input, data-stack, inert back toasts, +N more). jsdom + axe tests in toast-stack.dom.test.ts pass. AC1 left unchecked: the visual stack (scale/offset, expand/collapse without layout jump) needs a browser check.
<!-- SECTION:NOTES:END -->
