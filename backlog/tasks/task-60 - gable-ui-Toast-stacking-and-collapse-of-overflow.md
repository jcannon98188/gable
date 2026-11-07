---
id: TASK-60
title: 'gable-ui: Toast stacking and collapse of overflow'
status: To Do
assignee: []
created_date: '2026-11-07T04:57:00Z'
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
- [ ] #2 Timers stay paused while expanded
- [ ] #3 jsdom tests and axe pass
<!-- AC:END -->
