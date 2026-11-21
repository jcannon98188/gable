---
kind: ticket
title: "@gablejs/store: rxMethod"
status: resolved
blocked_by: [31]
tags:
  - store
  - ready-for-agent
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-32 - gable-store-rxMethod.md
assignee:
  - '@claude'
ordinal: 73000
---

## Question

rxMethod in the style of NgRx: accepts a value, signal or Observable and pipes it through an RxJS operator chain, cleaned up with the store scope. Built on toObservable and Gable's RxJS bridge.

## Acceptance criteria

- [x] #1 rxMethod accepts values, signals and observables and unsubscribes on scope disposal
- [x] #2 Tests and docs cover typical use (debounced search, http load)

## Implementation plan

1. rx-method.ts using Subject + toObservable in a child scope. 2. Tests. 3. Docs section.

## Implementation notes

Implemented packages/store/src/rx-method.ts (rxMethod, exported from index.ts), tests in rx-method.test.ts, docs/store.md section. vitest packages/store and tsc pass.

Housekeeping: @gablejs/store now declares rxjs as a peerDependency (^7.8.2, same as @gablejs/core; not optional because index.ts imports rxMethod statically). Lockfile updated.

## Answer

Added rxMethod: accepts value/signal/Observable, pipes through operator chain, tears down with owning scope (or options.scope); pipeline errors reported as subscription. Tests cover debounced search, http-style load with switchMap/catchError, scope disposal. Docs added. No core changes.
