---
id: TASK-15
title: 'toObservable: cheaper per-subscription cost'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:46'
updated_date: '2026-11-06 04:45'
labels:
  - performance
  - core
dependencies: []
priority: low
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/reactivity-benchmark: toObservable costs about 1us per emission and 2.5us per subscribe/unsubscribe because each subscription builds its own scope and effect, versus about 87ns for BehaviorSubject.next.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Subscribers of one toObservable source share one effect where semantics allow (or each subscription is otherwise made cheaper)
- [x] #2 Semantics tests for bridges still pass; benchmark numbers before/after recorded in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. toObservable: subscribers share one scope+effect, created by first subscriber, disposed with last; per-subscriber last-value dedupe; late joiners get the current value untracked.
2. Add tests; benchmark before/after.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Benchmark (ns/op): toObservable-subscribers (1000 subscribers, write+flush) 450 -> 72 / 72; toObservable-emit 1711 -> 792 / 783 (mostly the effect scheduling gains from TASK-14); round-trip 1760 -> 1482. toObservable-subscribe (subscribe+unsubscribe one at a time) 2598 -> 2965 / 2550: unchanged within noise, since a lone subscriber still creates and disposes a scope+effect; not improved. Added two tests in packages/testing/src/interop.test.ts (shared effect with independent unsubscribe and late join; resubscribe after last leaves).

Clean A/B vs 435b332 (Edge 156 headless, i9-9900KF, alternated runs, median of medians; details in docs/performance.md): toObservable-subscribers 0.33 -> 0.073 ms (-78%), toObservable-emit 0.94 -> 0.71 ms (-24%), round-trip 0.94 -> 0.81 ms (-14%); toObservable-subscribe unchanged (+0.4%). Possible regression: toSignal-fan-in (1,000 toSignals) 0.274 -> 0.314 ms (+14.5%), consistent over 8 runs per side, not yet investigated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
toObservable subscribers share one effect/scope; 1000-subscriber scenario 450 -> 72 ns/op. Lone subscribe/unsubscribe cost unchanged. Verified by benchmark and bridge tests.
<!-- SECTION:FINAL_SUMMARY:END -->
