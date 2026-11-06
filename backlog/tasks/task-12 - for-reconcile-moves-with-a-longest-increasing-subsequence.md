---
id: TASK-12
title: '@for: reconcile moves with a longest increasing subsequence'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:46'
updated_date: '2026-11-06 04:45'
labels:
  - performance
  - core
dependencies: []
priority: high
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The js-framework-benchmark app (examples/js-framework-benchmark) showed that swapping rows 2 and 999 of 1000 produces 1994 DOM childList mutations: the @for reconciler in packages/core/src/view.ts (around lines 436-445) keeps only rows whose old position keeps increasing (greedy), so one swap marks every row between the two as moved and re-inserts about 996 nodes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reconciliation moves only the minimal set of rows (longest increasing subsequence of old positions stay put)
- [x] #2 A swap of two rows in a 1000-row keyed list produces at most a handful of DOM mutations, covered by a test using the test renderer or a mutation count
- [x] #3 Existing @for tests and HMR state carry-over for rows still pass; benchmark swap timing re-measured and recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: bench + MutationObserver swap count (1994 mutations).
2. Replace the greedy increasing-position check in buildFor with an O(n log n) longest increasing subsequence over surviving rows' previous positions; only rows off the LIS move.
3. Test with a counting renderer (swap in 1000 rows); re-run bench.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Swap rows 2 and 999 of 1000: DOM childList mutations (added+removed nodes, MutationObserver in Edge) 1994 -> 4. Bench swap rows paint median 71.9ms -> 24.9ms/28.6ms (two runs; the machine was noisy). Unit test in packages/testing/src/for.test.ts counts renderer.insert calls (997 with the old greedy code, <=4 now). npx vitest run packages/testing packages/core: 282 passed incl. HMR carry-over tests. Bench numbers also include concurrent TASK-14 signals.ts edits in the working tree.

Clean A/B vs 435b332 (Edge 156 headless, i9-9900KF, alternated runs, median of medians; details in docs/performance.md): js-framework-benchmark clear 1,000 rows 86.7 -> 16.1 ms (-81%), swap rows 61.6 -> 23.6 ms (-62%), replace 1,000 rows 185 -> 107 ms (-42%); select/update/remove unchanged (same frame); create 1,000 -9% but baseline spread 56%, unproven.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
buildFor now keeps rows on a longest increasing subsequence of previous positions in place (longestIncreasing in packages/core/src/view.ts). Verified by a 1000-row swap test (insert calls 997 -> <=4), a real-browser MutationObserver count (1994 -> 4), and the testing/core suites.
<!-- SECTION:FINAL_SUMMARY:END -->
