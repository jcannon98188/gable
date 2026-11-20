---
kind: ticket
title: "gable-ui: Toast stacking and collapse of overflow"
status: claimed
claimed_by: imported
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-60 - gable-ui-Toast-stacking-and-collapse-of-overflow.md
ordinal: 108000
---

## Question

ui-toaster only hides toasts beyond limit. Add a Sonner-style stacked/collapsed presentation that expands on hover or focus, with a hidden-count indicator. Follow-up from ui/47.

## Acceptance criteria

- [ ] #1 Overflow toasts collapse into a stack and expand on hover/focus
- [x] #2 Timers stay paused while expanded
- [x] #3 jsdom tests and axe pass

## Implementation plan

1. Stack presentation in ui-toaster (collapsed grid stack, expand on hover/focus, +N more). 2. jsdom tests in toast-stack.dom.test.ts. 3. Docs.

## Implementation notes

Implemented in toast.ts (stack input, data-stack, inert back toasts, +N more). jsdom + axe tests in toast-stack.dom.test.ts pass. AC1 left unchecked: the visual stack (scale/offset, expand/collapse without layout jump) needs a browser check.
