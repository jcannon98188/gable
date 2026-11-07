---
id: TASK-81
title: 'gable-ui: Diagnostics table rows (variable height, wrapping, severity badge)'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The designer's Problems and HMR lists use fixed-height truncated rows and dropped the severity badges (TODO(gable-ui)).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-table and the virtual table support variable-height rows (measured) with a wrapping message cell
- [x] #2 A severity badge variant (error, warning, info, success) in ui-badge usable as a leading cell
- [x] #3 Virtual mode keeps scroll position stable while rows are measured
- [x] #4 Tests, an axe check and a gallery demo of a problems list
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Badge severity variants (error/warning/info/success). 2. Virtual table: variable row height (measured via virtualizer), wrap cells, badge cell kind. 3. ui-table: wrap cell class. 4. Tests + problems list demo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Badge variants error/warning/info/success; ui-virtual-table autoHeight (measured rows, estimate rowHeight), column wrap and kind=severity; UiTableCell wrap input; useVirtualizer shifts scroll when a row above the viewport is measured (virtual-core onLayout change info). Tests: virtual.test.ts, problems-table.dom.test.ts (axe), virtual.dom.test.ts scroll stability, gallery virtual.html Problems. Not verified in a real browser (ResizeObserver measurement + scroll anchoring are mocked in jsdom).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
<!-- SECTION:FINAL_SUMMARY:END -->
