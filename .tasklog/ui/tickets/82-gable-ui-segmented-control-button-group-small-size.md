---
kind: ticket
title: "gable-ui: Segmented control (button group small size)"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-82 - gable-ui-Segmented-control-button-group-small-size.md
priority: medium
ordinal: 139000
---

## Question

The design uses a small segmented control for mode, breakpoint, state, display and device. Likely needed by the designer redesign (inference, not confirmed).

## Acceptance criteria

- [x] #1 ui-toggle-group (single mode) and ui-button-group render as a connected segmented control with a size=sm variant and a selected state
- [x] #2 Keyboard roving and aria matching the existing toggle group; icon-only segments need an accessible name
- [x] #3 Tests, an axe check and a gallery demo

## Implementation plan

1. toggle-group segmented input + sm size, connected, aria-label for icon-only; button-group size sm. 2. Tests, axe, demo.

## Implementation notes

ui-toggle-group: segmented, icon and iconOnly items (label stays the accessible name via sr-only + title); segmented+size=sm maps to the compact toggle size from the density work. ui-button-group: segmented and size=sm, selected via aria-pressed/aria-current/data-state. Tests: segmented.dom.test.ts (6, axe), gallery button-group.html. Button group buttons stay separate tab stops (no roving); toggle-group is the roving one.

## Answer

Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
