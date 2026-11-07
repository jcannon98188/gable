---
id: TASK-55
title: 'ui-gallery axe violations: unnamed Select trigger, heading order in Alert'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:34:00Z'
updated_date: '2026-11-07T04:34:00Z'
labels:
  - a11y
  - ui
dependencies:
  - TASK-39
priority: medium
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by expectNoA11yViolations (TASK-39) on the ui-gallery under jsdom. 1) button-name (critical): the UiSelect trigger (role=combobox button, e.g. #select:select-7:trigger) has no accessible name when no label is attached; give it aria-labelledby/aria-label support or fall back to placeholder. 2) heading-order (moderate): gallery Alert uses <h5 uiAlertTitle> after an h2; UiAlertTitle should not force a heading level (or gallery should use a sane level). Once fixed, remove the disableRules in examples/ui-gallery/src/a11y.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 UiSelect trigger has an accessible name
- [x] #2 Alert title heading order passes axe
- [x] #3 examples/ui-gallery/src/a11y.test.ts runs with no disabled rules
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. UiSelect: trigger via uiProps, drop dangling aria-labelledby, add label/labelledBy inputs, fallback aria-label to shown text. 2. UiAlertTitle: optional level input (role=heading); gallery uses div. 3. Remove disableRules. 4. Replace TODO(TASK-36) flags with kind/type comparisons in dropdown-menu, context-menu, pagination.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: packages/ui + ui-primitives tests green for touched files, gallery a11y test passes without disabled rules via a temporary root-alias vitest config (removed). Unrelated failures in in-progress command/input-otp/toast files (another agent).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
UiSelect trigger now has an accessible name (aria-label from label input, else shown text; labelledBy passthrough; dangling Zag aria-labelledby removed). UiAlertTitle gains an optional level input; gallery Alert title now a div. disableRules removed from gallery a11y test. Also replaced TODO(TASK-36) row flags with kind/type comparisons in dropdown-menu, context-menu and pagination.
<!-- SECTION:FINAL_SUMMARY:END -->
