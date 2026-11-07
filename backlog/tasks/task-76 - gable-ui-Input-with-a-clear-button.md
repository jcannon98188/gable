---
id: TASK-76
title: 'gable-ui: Input with a clear button'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:49:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The designer shell's class search and class entry use a native input because gable-ui's input has no clear affordance (tailwind-panel.ts:34 TODO(gable-ui)).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-input-clear (or an input recipe) shows a clear button when the field has a value and focus returns to the input after clearing
- [x] #2 The clear button has an accessible name, can be reached by keyboard and is hidden when the field is empty or disabled
- [x] #3 Works with [field] / ngModel-style bindings: clearing updates the bound value and marks the field touched
- [x] #4 Unit tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
New ui-input-clear component (own input, value model, touched output, [field] custom control) with a clear button; input.ts gains shared inputVariants with density. Tests: mount + jsdom + axe; gallery page.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ui-input-clear (input-clear.ts) draws its own input styled via shared inputVariants (input.ts); value model, touched/cleared outputs, disabled/readonly/invalid follow [field]. Verified by input-clear.dom.test.ts (jsdom: button visibility, focus return, Escape, [field] value+touched, axe) and gallery density-demo.test.ts. Not checked in a real browser.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ui-input-clear (clear button when non-empty and enabled, focus returns to the input, [field] compatible), exported inputVariants for reuse. Tests: input-clear.dom.test.ts, gallery density demo with axe. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
