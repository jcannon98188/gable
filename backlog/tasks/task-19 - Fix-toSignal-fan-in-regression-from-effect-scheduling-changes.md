---
id: TASK-19
title: Fix toSignal fan-in regression from effect scheduling changes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06 07:00'
updated_date: '2026-11-06 08:04'
labels:
  - performance
  - core
  - bug
dependencies: []
priority: medium
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The baseline/current A/B in docs/performance.md found the toSignal-fan-in scenario (1,000 toSignals feeding one sum) about 14% slower after the TASK-14/15 changes (0.274 -> 0.314 ms/run), in all 8 runs per side with non-overlapping ranges, while the RxJS control stayed flat. Suspected cause is the bucketed effect flush in packages/core/src/signals.ts but it is not investigated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cause identified with a profile or bisect between 435b332 and HEAD, recorded in the task notes
- [ ] #2 toSignal-fan-in is back at or below the 435b332 baseline in an A/B comparison, without regressing the effects-shared, effects-sparse, create-dispose and toObservable scenarios beyond noise
- [x] #3 Effect ordering tests (packages/core/src/order.test.ts) and the full suite pass; docs/performance.md updated with the new numbers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the A/B with 435b332 (git worktree) vs HEAD dist in isolated benchmark copies, alternating runs.
2. Toggle pieces of the TASK-14 diff (writes counter, read-phase wrapper, EffectNode extends Signal.Computed) to find the cause.
3. Fix without losing effects/toObservable gains; keep ordering semantics.
4. Add a regression guard test, re-run A/B (>=4 rounds per side) for fan-in and the effects/create-dispose/toObservable scenarios.
5. Update docs/performance.md, record notes, run vitest on packages/core and packages/testing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the A/B (435b332 worktree vs HEAD dist, isolated benchmark copies, A/B/B/A, 8 runs/side): fan-in 0.277 vs 0.320 ms (+10..17% over repeats; a few noisy sets hid it). Bisect by toggling dist pieces was inconsistent: dropping writes++ ~3%; read-phase wrapper no effect; EffectNode as plain object + WeakMap closed the gap but cost create-dispose +27% / toObservable-subscribe +29% (rejected); Map+delete variants did not close it; --no-maglev or larger inlining budget closes it, so the remainder is JIT-inlining sensitive. No single culprit line found. cpu-profile was dominated by RxJS and showed nothing useful.

Fix: toSignal uses new internal stateSource() (read/write straight over one Signal.State, one fewer call layer per read); write counter incremented only while an effect first run is active (firstRuns>0). Result A/B/B/A 8 runs/side: fan-in baseline 0.277, HEAD 0.320, fixed 0.289 (+4% vs baseline, ranges overlap; steady state 300 samples 0.161 vs 0.187). effects-shared/sparse, create-dispose, toObservable-*, round-trip within noise of HEAD. Guard test added to packages/core/src/order.test.ts. vitest run: 47 files / 505 tests pass (packages/core + packages/testing: 26 files / 284 tests). docs/performance.md updated. Side observation, not changed: a test where an effect's first run writes a signal it read did not re-run on HEAD either (same failure before my change); possible gap in the TASK-14 first-run-write path (bucket queued but schedule() not called), needs a follow-up decision.
<!-- SECTION:NOTES:END -->
