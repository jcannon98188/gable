---
kind: ticket
title: "@gable/store: HMR state preservation and language-service checks"
status: resolved
blocked_by: [31]
tags:
  - store
  - ready-for-agent
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-34 - gable-store-HMR-state-preservation-and-language-service-checks.md
ordinal: 75000
---

## Question

Use Gable's hotState so store state survives hot updates, and add language-service checks for common store mistakes (writing state outside patchState, calling a store method in a template value expression, store created outside an injection context) where they fit the existing rules in packages/language-service.

## Acceptance criteria

- [x] #1 A store keeps its state across a hot module update, covered by a test on the HMR test harness
- [x] #2 Language-service rules added with fixtures and documented

## Implementation notes

Added withHotState(import.meta, key, {reset}) in store.ts (hotState holder; patchState persists synchronously; restores surviving keys on construction, dev only). Tests: store.test.ts, testing/src/hmr-state.test.ts. Language-service rules store-write-outside-patch, store-method-in-template, store-outside-injection-context with fixtures store-pass/store-fail; documented in docs/store.md and getting-started.md. Vitest store+language-service+testing green; tsc errors remain only in another agent's entities.ts.

## Answer

Store state survives hot module updates via withHotState (core hotState). Three language-service store rules added with fixtures and docs.
