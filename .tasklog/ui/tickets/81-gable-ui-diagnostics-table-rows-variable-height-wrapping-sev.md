---
kind: ticket
title: "gable-ui: Diagnostics table rows (variable height, wrapping, severity badge)"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-81 - gable-ui-Diagnostics-table-rows-variable-height-wrapping-severity-badge.md
priority: medium
ordinal: 138000
---

## Question

The designer's Problems and HMR lists use fixed-height truncated rows and dropped the severity badges (TODO(gable-ui)).

## Acceptance criteria

- [x] #1 ui-table and the virtual table support variable-height rows (measured) with a wrapping message cell
- [x] #2 A severity badge variant (error, warning, info, success) in ui-badge usable as a leading cell
- [x] #3 Virtual mode keeps scroll position stable while rows are measured
- [x] #4 Tests, an axe check and a gallery demo of a problems list

## Implementation plan

1. Badge severity variants (error/warning/info/success). 2. Virtual table: variable row height (measured via virtualizer), wrap cells, badge cell kind. 3. ui-table: wrap cell class. 4. Tests + problems list demo.

## Implementation notes

Badge variants error/warning/info/success; ui-virtual-table autoHeight (measured rows, estimate rowHeight), column wrap and kind=severity; UiTableCell wrap input; useVirtualizer shifts scroll when a row above the viewport is measured (virtual-core onLayout change info). Tests: virtual.test.ts, problems-table.dom.test.ts (axe), virtual.dom.test.ts scroll stability, gallery virtual.html Problems. Not verified in a real browser (ResizeObserver measurement + scroll anchoring are mocked in jsdom).

## Answer

Implemented with unit, DOM, axe and gallery tests; typecheck:tests and build pass; packages/ui + ui-primitives suites and gallery suite pass. See implementation notes for limitations and follow-ups. Not verified in a real browser.
