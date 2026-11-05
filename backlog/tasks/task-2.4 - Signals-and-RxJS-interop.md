---
id: TASK-2.4
title: Signals and RxJS interop
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:40'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.3
parent_task_id: TASK-2
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

toSignal for Observables and Promises, toObservable (flush-aligned), the opt-in renderScheduler, output() as an Observable, and bare Observable or Promise references in templates that bind directly (undefined before first emission, optional-chaining along paths). Bridges are scope-owned and torn down on destroy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Emissions from RxJS reach views within the same coalesced flush
- [x] #2 Subscriptions are torn down when the scope is destroyed
- [x] #3 A bridged stream error is reported to the error path without the signal throwing
- [x] #4 A completed Observable keeps its last value
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Interop merged: toSignal, toObservable, renderScheduler, output, bare Observable/Promise template binding (duck-typed, core signals stay RxJS-free). Verified on merged integration (152 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
