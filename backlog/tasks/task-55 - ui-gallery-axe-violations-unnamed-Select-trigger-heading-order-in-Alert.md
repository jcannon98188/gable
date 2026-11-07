---
id: TASK-55
title: 'ui-gallery axe violations: unnamed Select trigger, heading order in Alert'
status: To Do
assignee: []
created_date: '2026-11-07T03:34:00Z'
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
- [ ] #1 UiSelect trigger has an accessible name
- [ ] #2 Alert title heading order passes axe
- [ ] #3 examples/ui-gallery/src/a11y.test.ts runs with no disabled rules
<!-- AC:END -->
