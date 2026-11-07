---
id: TASK-32
title: '@gable/store: rxMethod'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:12:00Z'
updated_date: '2026-11-07T03:19:00Z'
labels:
  - store
  - ready-for-agent
dependencies:
  - TASK-31
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rxMethod in the style of NgRx: accepts a value, signal or Observable and pipes it through an RxJS operator chain, cleaned up with the store scope. Built on toObservable and Gable's RxJS bridge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rxMethod accepts values, signals and observables and unsubscribes on scope disposal
- [x] #2 Tests and docs cover typical use (debounced search, http load)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. rx-method.ts using Subject + toObservable in a child scope. 2. Tests. 3. Docs section.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented packages/store/src/rx-method.ts (rxMethod, exported from index.ts), tests in rx-method.test.ts, docs/store.md section. vitest packages/store and tsc pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added rxMethod: accepts value/signal/Observable, pipes through operator chain, tears down with owning scope (or options.scope); pipeline errors reported as subscription. Tests cover debounced search, http-style load with switchMap/catchError, scope disposal. Docs added. No core changes.
<!-- SECTION:FINAL_SUMMARY:END -->
