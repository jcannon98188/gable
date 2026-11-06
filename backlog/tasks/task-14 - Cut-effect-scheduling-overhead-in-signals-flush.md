---
id: TASK-14
title: Cut effect scheduling overhead in signals flush
status: Done
assignee:
  - '@claude'
created_date: '2026-11-06 03:46'
updated_date: '2026-11-06 03:50'
labels:
  - performance
  - core
dependencies: []
priority: medium
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
examples/reactivity-benchmark: effect() costs about 1.5-2x a raw signal-polyfill Watcher in the shared-effects and create/dispose scenarios. flushNow calls watcher.getPending() every round plus one extra confirming round, and sorts and does Map lookups; the sparse-effects scenario costs about 7.5us per dirty effect among 10,000, suggesting a scan of all watched nodes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 flushNow avoids a full scan to find pending effects where possible (e.g. tracking dirty effects) and skips the redundant final round when nothing changed
- [x] #2 Reactivity benchmark rerun with before/after numbers in the task notes; no scenario regresses beyond noise
- [x] #3 Effect ordering semantics (documented in packages/core/src/order.test.ts) unchanged and tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the single watcher + Map lookup with watchers over buckets of 32 effects; notify records the dirty bucket, so a flush scans only dirty buckets and skips getPending entirely when nothing was notified (no redundant confirming round).
2. EffectNode subclasses Signal.Computed (no Map/object alloc per effect).
3. Keep ordering (depth, seq sort). Benchmark before/after; run core+testing tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Benchmark (examples/reactivity-benchmark, ns/op, gable; noisy machine). Before -> after run1 / run2: effects-shared 1212 -> 744 / 583 (polyfill ~620-700 in same runs); effects-sparse 9728 -> 7291 / 4778 (sparse was dominated by running the 100 dirty effects, not the scan; polyfill 6418-21843 across runs); create-dispose 5283 -> 3473 / 2193; batched-writes 142 -> 68 (microtask 144 -> 87); other scenarios (deep-chain, wide-fanout, diamond, dynamic-deps, toSignal-*) unchanged within noise. Implementation: bucketed watchers (32 effects each) with dirty-bucket list; EffectNode extends Signal.Computed; flushNow skips scanning when no bucket was notified. A write during an effect's first run (tracked by a write counter) queues its bucket for the next flush scan, matching the old getPending behaviour. Tests: npx vitest run packages/core packages/testing all pass (order.test.ts unchanged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bucketed effect watchers with dirty-bucket tracking, no full scan and no redundant final round; Computed-subclass nodes. Benchmark improved or flat in all scenarios; core+testing tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->
