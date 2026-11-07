---
id: TASK-82
title: 'gable-ui: Segmented control (button group small size)'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design uses a small segmented control for mode, breakpoint, state, display and device. Likely needed by the designer redesign (inference, not confirmed).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-toggle-group (single mode) and ui-button-group render as a connected segmented control with a size=sm variant and a selected state
- [x] #2 Keyboard roving and aria matching the existing toggle group; icon-only segments need an accessible name
- [x] #3 Tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. toggle-group segmented input + sm size, connected, aria-label for icon-only; button-group size sm. 2. Tests, axe, demo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ui-toggle-group: segmented, icon and iconOnly items (label stays the accessible name via sr-only + title); segmented+size=sm maps to the compact toggle size from the density work. ui-button-group: segmented and size=sm, selected via aria-pressed/aria-current/data-state. Tests: segmented.dom.test.ts (6, axe), gallery button-group.html. Button group buttons stay separate tab stops (no roving); toggle-group is the roving one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
