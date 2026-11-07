---
id: TASK-34
title: '@gable/store: HMR state preservation and language-service checks'
status: Done
assignee: []
created_date: '2026-11-07T03:12:00Z'
updated_date: '2026-11-07T03:21:00Z'
labels:
  - store
  - ready-for-agent
dependencies:
  - TASK-31
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use Gable's hotState so store state survives hot updates, and add language-service checks for common store mistakes (writing state outside patchState, calling a store method in a template value expression, store created outside an injection context) where they fit the existing rules in packages/language-service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A store keeps its state across a hot module update, covered by a test on the HMR test harness
- [x] #2 Language-service rules added with fixtures and documented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added withHotState(import.meta, key, {reset}) in store.ts (hotState holder; patchState persists synchronously; restores surviving keys on construction, dev only). Tests: store.test.ts, testing/src/hmr-state.test.ts. Language-service rules store-write-outside-patch, store-method-in-template, store-outside-injection-context with fixtures store-pass/store-fail; documented in docs/store.md and getting-started.md. Vitest store+language-service+testing green; tsc errors remain only in another agent's entities.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Store state survives hot module updates via withHotState (core hotState). Three language-service store rules added with fixtures and docs.
<!-- SECTION:FINAL_SUMMARY:END -->
