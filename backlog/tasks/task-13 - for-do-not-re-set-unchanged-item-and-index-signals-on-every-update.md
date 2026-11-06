---
id: TASK-13
title: '@for: do not re-set unchanged item and index signals on every update'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:46'
updated_date: '2026-11-06 03:54'
labels:
  - performance
  - core
dependencies: []
priority: high
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each @for run sets the item and index signals of every surviving row even when unchanged, which wakes each row's dependents. This likely explains slow select/remove/replace in examples/js-framework-benchmark. Create-10k (about 1s) is dominated by per-row component creation and should also be profiled.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A surviving row whose item (by identity) and index are unchanged does not write its signals, proven by a test counting recomputes/effect runs
- [x] #2 Row creation cost for 10k rows is profiled and any cheap wins taken, with before/after numbers in the task notes
- [x] #3 Existing tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Track the last item written per row and skip item/index writes when unchanged (identity / same position); test with counting getters.
2. Profile 10k row creation (CDP profiler in Edge); take cheap wins (skip re-inserting trailing newly created rows).
3. Re-run bench and tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC1: rows now remember the last item written (Row.value) and skip item.set when identical and index.set when pos is unchanged. Note Signal.State already dedupes with Object.is, so the saving is the skipped set call, not a recompute; the new test (counting getter items) passes before and after and acts as a regression guard. AC2 profile of create 10k (CDP sampling, Edge): ~1.9s total, ~930ms '(program)' (native layout/style), 114ms GC, ~97ms setAttribute, ~97ms insertBefore; Gable's own JS is a small share. Cheap win taken: newly created rows at the end of the list were inserted once while building and again in the placement loop; the trailing run is now left in place (insertBefore into tbody for create 10k: 20000 -> 10000). Create 10k paint median ~1000-1550ms before and after, within noise on this machine (1196.6 baseline; 1002/1315/1430/1552 after), so no measurable time win is claimed. Create 1,000 baseline 207ms vs 114-222ms after, also noisy. Tests: 282 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Skip unchanged item/index writes per surviving row and avoid double-inserting trailing newly created rows in @for (packages/core/src/view.ts). 10k creation profiled: dominated by browser-native work; no significant timing change measurable. Verified with the testing/core suites (282 passed) and browser profiling/insert counting.
<!-- SECTION:FINAL_SUMMARY:END -->
