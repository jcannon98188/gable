---
kind: ticket
title: Cut effect scheduling overhead in signals flush
status: resolved
tags:
  - performance
  - core
  - priority-medium
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-14 - Cut-effect-scheduling-overhead-in-signals-flush.md
assignee:
  - '@claude'
priority: medium
ordinal: 55000
---

## Question

examples/reactivity-benchmark: effect() costs about 1.5-2x a raw signal-polyfill Watcher in the shared-effects and create/dispose scenarios. flushNow calls watcher.getPending() every round plus one extra confirming round, and sorts and does Map lookups; the sparse-effects scenario costs about 7.5us per dirty effect among 10,000, suggesting a scan of all watched nodes.

## Acceptance criteria

- [x] #1 flushNow avoids a full scan to find pending effects where possible (e.g. tracking dirty effects) and skips the redundant final round when nothing changed
- [x] #2 Reactivity benchmark rerun with before/after numbers in the task notes; no scenario regresses beyond noise
- [x] #3 Effect ordering semantics (documented in packages/core/src/order.test.ts) unchanged and tests pass

## Implementation plan

1. Replace the single watcher + Map lookup with watchers over buckets of 32 effects; notify records the dirty bucket, so a flush scans only dirty buckets and skips getPending entirely when nothing was notified (no redundant confirming round).
2. EffectNode subclasses Signal.Computed (no Map/object alloc per effect).
3. Keep ordering (depth, seq sort). Benchmark before/after; run core+testing tests.

## Implementation notes

Benchmark (examples/reactivity-benchmark, ns/op, gable; noisy machine). Before -> after run1 / run2: effects-shared 1212 -> 744 / 583 (polyfill ~620-700 in same runs); effects-sparse 9728 -> 7291 / 4778 (sparse was dominated by running the 100 dirty effects, not the scan; polyfill 6418-21843 across runs); create-dispose 5283 -> 3473 / 2193; batched-writes 142 -> 68 (microtask 144 -> 87); other scenarios (deep-chain, wide-fanout, diamond, dynamic-deps, toSignal-*) unchanged within noise. Implementation: bucketed watchers (32 effects each) with dirty-bucket list; EffectNode extends Signal.Computed; flushNow skips scanning when no bucket was notified. A write during an effect's first run (tracked by a write counter) queues its bucket for the next flush scan, matching the old getPending behaviour. Tests: npx vitest run packages/core packages/testing all pass (order.test.ts unchanged).

Clean A/B vs 435b332 (Edge 156 headless, i9-9900KF, alternated runs, median of medians; details in docs/performance.md): reactivity-benchmark create-dispose 4.43 -> 1.97 ms (-56%), effects-sparse 0.63 -> 0.27 ms (-57%), effects-shared 5.67 -> 4.28 ms (-25%); batched-writes unchanged (0.064 vs 0.065 ms). Caveat: effects-sparse polyfill control is bimodal run to run.

## Answer

Bucketed effect watchers with dirty-bucket tracking, no full scan and no redundant final round; Computed-subclass nodes. Benchmark improved or flat in all scenarios; core+testing tests pass.
