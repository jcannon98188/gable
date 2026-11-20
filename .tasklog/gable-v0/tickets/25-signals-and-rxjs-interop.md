---
kind: ticket
title: Signals and RxJS interop
status: resolved
blocked_by: [24]
tags:
  - ready-for-agent
  - parent-2
created: 2026-11-05
updated: 2026-11-05
imported_from: backlog/tasks/task-2.4 - Signals-and-RxJS-interop.md
assignee:
  - '@jason'
ordinal: 25000
---

## Question

Imported from backlog.md without a description.

## Acceptance criteria

- [x] #1 Emissions from RxJS reach views within the same coalesced flush
- [x] #2 Subscriptions are torn down when the scope is destroyed
- [x] #3 A bridged stream error is reported to the error path without the signal throwing
- [x] #4 A completed Observable keeps its last value

## Answer

Interop merged: toSignal, toObservable, renderScheduler, output, bare Observable/Promise template binding (duck-typed, core signals stay RxJS-free). Verified on merged integration (152 tests).

## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

toSignal for Observables and Promises, toObservable (flush-aligned), the opt-in renderScheduler, output() as an Observable, and bare Observable or Promise references in templates that bind directly (undefined before first emission, optional-chaining along paths). Bridges are scope-owned and torn down on destroy.
