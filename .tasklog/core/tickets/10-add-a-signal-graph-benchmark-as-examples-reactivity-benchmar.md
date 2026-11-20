---
kind: ticket
title: Add a signal-graph benchmark as examples/reactivity-benchmark
status: resolved
tags:
  - example
  - performance
  - priority-medium
created: 2026-11-06
updated: 2026-11-06
imported_from: backlog/tasks/task-10 - Add-a-signal-graph-benchmark-as-examples-reactivity-benchmark.md
assignee:
  - '@claude'
priority: medium
ordinal: 51000
---

## Question

Measures the cost of Gable's signals (on the TC39 polyfill) and the RxJS bridges with no DOM involved, in the style of milomg/js-reactivity-benchmark: deep, wide and dynamic dependency graphs and many subscribers.

## Acceptance criteria

- [x] #1 Node script benchmarks signal/computed/effect scenarios (deep chain, wide fan-out, dynamic dependencies, many subscribers) and prints timings
- [x] #2 Includes toObservable/toSignal bridge scenarios
- [x] #3 README explains scenarios and how to run

## Implementation plan

1. examples/reactivity-benchmark: plain Node ESM harness (bench.mjs) installing @gable/core from vendor/ tarball via scripts/pack-local.mjs (file: dep + overrides), plus signal-polyfill and rxjs for baselines.
2. Scenarios: deep chain, wide fan-out, diamond, dynamic deps, many effects, repeated writes with batched flush, toObservable, toSignal. Each runs on Gable and, where natural, on raw polyfill / RxJS.
3. Timing: warmup, N samples, median/min, table + optional --json. Correctness check per scenario so we never time a broken graph.
4. README; run end to end; note anomalies.

## Implementation notes

Verified: 'npm run bench' in examples/reactivity-benchmark ran all 14 scenarios end to end (full scale, 21 samples), each run asserting results; --quick and --json also run. Sample (ns/op, gable vs polyfill vs rxjs): deep-chain 142/160/46, wide-fanout 291/230/3376, diamond 304/159/46571, effects-shared 1445/762/73, create-dispose 9197/6248/387, toObservable-emit 1083 vs 87 (BehaviorSubject), toSignal-fan-in 985 vs 2626 (combineLatest). Findings: flushNow re-scans watcher.getPending() (O(watched)) each round plus a final quiet round; effect() is ~1.5-2x the raw polyfill Watcher in shared/create-dispose scenarios; RxJS 1000-deep pipe overflows a cold stack and RxJS swallows the RangeError (benchmark uses depth 250 for RxJS).

## Answer

Added examples/reactivity-benchmark: Node ESM benchmark (src/bench.mjs, harness.mjs, scenarios.mjs) of Gable signals/effects and toObservable/toSignal against the raw signal-polyfill and RxJS across 14 scenarios, with median/min/ns-per-op table and --json. @gable/core installed from vendor/ via npm run pack:local. README documents scenarios and usage. Verified by running the full benchmark and --quick/--json modes; every run asserts its results.
