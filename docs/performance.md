# Performance: before and after the TASK-12..15 work

A clean A/B measurement of the performance work in `aef49bc` (TASK-12/13/14/15: `@for` LIS reconciler with fewer signal
writes, bucketed effect flush, shared `toObservable` effect) and `f648502` (HMR: method-edit versioning, cheaper
`captureViewState`) against the commit just before it, `435b332`.

## Method

- **Baseline** = `435b332` (git worktree, `npm install && npm run build`, `npm pack` of every publishable package).
  **Current** = `f648502` (HEAD, same procedure). The benchmark apps from HEAD (`examples/js-framework-benchmark`,
  `examples/reactivity-benchmark`, `examples/hmr-benchmark`) were copied twice outside the repo; each copy has its own
  `vendor/` with the baseline or the current tarballs, and a fresh `npm install` (no lockfile, no stale
  `node_modules/@gable`). The same benchmark code and app source therefore run on both framework builds. Which build is
  installed was verified by looking for the `longestIncreasing` helper (the LIS reconciler) in the installed
  `@gable/core/dist`: present only in the current copies.
- **Alternation**: runs were interleaved A/B/B/A/A/B/B/A so that slow drift of the machine hits both sides equally.
  Reported numbers are the **median of the per-run medians**; "spread" is (max - min) / median across those per-run medians.
- **js-framework-benchmark**: `npm run bench -- --iterations 20`, 8 runs (4 per side). Fresh page per iteration, headless Edge.
  The metric is click to next painted frame, quantized to the ~16.7 ms frame interval, so differences under one frame are noise.
- **reactivity-benchmark**: `node src/bench.mjs --json --samples 31` (3 warmup), 16 runs (8 per side).
- **hmr-benchmark**: `--sizes 500,2000 --iterations 10`, 4 runs in B/C/C/B order (2 per side), msedge. State was kept in every row on both sides.
- **Environment**: Intel Core i9-9900KF @ 3.6 GHz, 64 GB, Windows 11 Pro (10.0.26200), Node v24.21.0, Microsoft Edge 156.0.4314.58 headless, vite 8.3.6.
  The machine was otherwise idle, but see the noise note below.

## js-framework-benchmark (click to paint, ms, lower is better)

| operation | paint base ms | paint cur ms | change | spread b/c | script base ms | script cur ms | change |
|---|---|---|---|---|---|---|---|
| create 1,000 rows | 118.8 | 108.0 | -9.1% | 56% / 5% | 0.95 | 0.80 | -15.8% |
| replace 1,000 rows | 185.1 | 106.9 | -42.2% | 20% / 16% | 0.30 | 0.30 | +0.0% |
| update every 10th row | 22.5 | 22.6 | +0.4% | 11% / 3% | 0.25 | 0.30 | +20.0% |
| select row | 17.2 | 17.3 | +0.6% | 3% / 5% | 0.80 | 0.85 | +6.3% |
| swap rows | 61.6 | 23.6 | -61.7% | 13% / 4% | 0.20 | 0.15 | -25.0% |
| remove row | 29.2 | 29.2 | -0.0% | 21% / 20% | 0.30 | 0.30 | +0.0% |
| create 10,000 rows | 980.6 | 936.0 | -4.6% | 13% / 4% | 3.30 | 3.00 | -9.1% |
| append 1,000 rows | 108.8 | 105.2 | -3.3% | 8% / 10% | 0.30 | 0.30 | +0.0% |
| clear 1,000 rows | 86.7 | 16.1 | -81.5% | 9% / 14% | 0.10 | 0.10 | +0.0% |

"script" is the synchronous click handling alone (sub-millisecond for most operations, so its percentages are timer-resolution noise and not worth reading).

## reactivity-benchmark (ms per run, lower is better)

Median of 8 runs per side. The `polyfill` and `rxjs` rows run code that did not change between the two builds, so they act as controls: they should read about 0%.

| scenario / impl | baseline ms | current ms | change | spread base | spread cur |
|---|---|---|---|---|---|
| deep-chain / gable | 0.778 | 0.759 | -2.3% | 5.1% | 10.7% |
| deep-chain / polyfill | 0.810 | 0.812 | +0.3% | 6.5% | 4.4% |
| deep-chain / rxjs | 0.062 | 0.061 | -1.8% | 63.5% | 14.7% |
| wide-fanout / gable | 1.022 | 1.034 | +1.2% | 34.5% | 18.9% |
| wide-fanout / polyfill | 1.085 | 1.083 | -0.2% | 6.7% | 20.7% |
| wide-fanout / rxjs | 18.331 | 18.312 | -0.1% | 10.9% | 18.4% |
| diamond / gable | 0.028 | 0.028 | -1.8% | 29.4% | 36.8% |
| diamond / polyfill | 0.030 | 0.031 | +2.2% | 4.7% | 11.4% |
| diamond / rxjs | 4.842 | 4.545 | -6.1% | 15.8% | 13.4% |
| dynamic-deps / gable | 0.550 | 0.532 | -3.2% | 21.9% | 30.1% |
| dynamic-deps / polyfill | 0.532 | 0.520 | -2.3% | 94.0% | 11.5% |
| effects-shared / gable | 5.667 | 4.275 | -24.6% | 20.4% | 33.3% |
| effects-shared / polyfill | 3.759 | 3.954 | +5.2% | 18.1% | 31.7% |
| effects-shared / rxjs | 0.262 | 0.329 | +25.5% | 72.0% | 93.9% |
| effects-sparse / gable | 0.630 | 0.274 | -56.5% | 18.1% | 34.0% |
| effects-sparse / polyfill | 0.292 | 0.193 | -33.9% | 81.9% | 75.2% |
| effects-sparse / rxjs | 0.047 | 0.047 | +1.5% | 22.7% | 10.8% |
| batched-writes / gable | 0.064 | 0.065 | +1.6% | 53.4% | 3.8% |
| batched-writes / gable (microtask) | 0.064 | 0.065 | +0.8% | 8.1% | 4.3% |
| batched-writes / polyfill | 0.067 | 0.066 | -1.5% | 70.7% | 16.3% |
| batched-writes / rxjs | 0.096 | 0.093 | -2.8% | 13.0% | 71.1% |
| create-dispose / gable | 4.431 | 1.969 | -55.6% | 4.6% | 5.5% |
| create-dispose / polyfill | 4.757 | 4.814 | +1.2% | 10.1% | 15.6% |
| create-dispose / rxjs | 0.277 | 0.280 | +1.2% | 9.0% | 64.9% |
| toObservable-emit / gable | 0.935 | 0.707 | -24.4% | 6.3% | 20.9% |
| toObservable-emit / rxjs (BehaviorSubject) | 0.058 | 0.059 | +2.2% | 7.6% | 94.6% |
| toObservable-subscribers / gable | 0.333 | 0.073 | -78.1% | 22.0% | 29.6% |
| toObservable-subscribers / rxjs (BehaviorSubject) | 0.023 | 0.024 | +3.0% | 5.2% | 79.7% |
| toObservable-subscribe / gable | 2.307 | 2.315 | +0.4% | 8.7% | 19.3% |
| toObservable-subscribe / rxjs (BehaviorSubject) | 0.230 | 0.228 | -0.8% | 76.3% | 3.1% |
| toSignal-chain / gable | 1.717 | 1.743 | +1.5% | 3.7% | 24.1% |
| toSignal-chain / polyfill | 1.606 | 1.611 | +0.3% | 3.0% | 0.6% |
| toSignal-chain / rxjs | 0.227 | 0.231 | +1.6% | 50.5% | 10.7% |
| toSignal-fan-in / gable | 0.274 | 0.314 | +14.5% | 4.4% | 8.4% |  (before the TASK-19 fix; see below)
| toSignal-fan-in / rxjs | 1.830 | 1.811 | -1.0% | 5.6% | 3.1% |
| round-trip / gable | 0.944 | 0.814 | -13.7% | 13.5% | 9.2% |
| round-trip / rxjs | 0.093 | 0.093 | +0.1% | 25.2% | 2.9% |

## hmr-benchmark (edit to DOM updated, median ms, lower is better)

| N | target | edit | baseline (2 runs) | current (2 runs) | change (mean of runs) |
|---|---|---|---|---|---|
| 500 | leaf | class field | 51, 60 | 53, 64 | 5.4% |
| 500 | leaf | class method | 52, 59 | 57, 65 | 9.9% |
| 500 | leaf | template text | 47, 57 | 52, 63 | 10.6% |
| 500 | leaf | style | 49, 55 | 52, 64 | 11.5% |
| 500 | leaf | service | 170, 191 | 130, 141 | -24.9% |
| 500 | inner | class field | 105, 113 | 90, 95 | -15.1% |
| 500 | inner | class method | 52, 59 | 55, 55 | -0.9% |
| 500 | inner | template text | 102, 112 | 88, 88 | -17.8% |
| 500 | inner | style | 48, 60 | 54, 53 | -0.9% |
| 500 | inner | service | 160, 183 | 129, 137 | -22.4% |
| 2000 | leaf | class field | 203, 219 | 256, 204 | 9.0% |
| 2000 | leaf | class method | 203, 213 | 236, 211 | 7.5% |
| 2000 | leaf | template text | 203, 216 | 255, 298 | 32.0% |
| 2000 | leaf | style | 196, 214 | 221, 232 | 10.5% |
| 2000 | leaf | service | 1314, 1402 | 806, 807 | -40.6% |
| 2000 | inner | class field | 685, 763 | 489, 482 | -32.9% |
| 2000 | inner | class method | 197, 218 | 200, 215 | 0.0% |
| 2000 | inner | template text | 700, 752 | 482, 554 | -28.7% |
| 2000 | inner | style | 198, 218 | 194, 225 | 0.7% |
| 2000 | inner | service | 1314, 1451 | 785, 840 | -41.2% |

Initial render of the generated app (500 / 2000 components), baseline vs current: 1821 / 4915 ms and 2001 / 5404 ms (baseline runs 1 and 4) against 1755 / 4943 ms and 1792 / 5046 ms (current runs 2 and 3), so no visible change. Only 2 runs per side, and the baseline pair already differs by 8-12% from drift, so changes under about 10% in this table are not distinguishable from noise.

## Interpretation

**Real, large wins (far outside the noise):**

- `@for` reconcile (js-framework-benchmark): clear 1,000 rows 86.7 to 16.1 ms (-81%), swap rows 61.6 to 23.6 ms (-62%), replace 1,000 rows 185 to 107 ms (-42%). Run-to-run ranges of the two sides do not overlap. Swap and clear now sit at the one-or-two-frame floor.
- Effect scheduling (reactivity): `create-dispose` 4.43 to 1.97 ms (-56%, spreads about 5%), `effects-sparse` 0.63 to 0.27 ms (-57%), `effects-shared` 5.67 to 4.28 ms (-25%).
- Shared `toObservable` effect: `toObservable-subscribers` 0.33 to 0.073 ms (-78%), `toObservable-emit` 0.94 to 0.71 ms (-24%), `round-trip` 0.94 to 0.81 ms (-14%).
- HMR: edits that re-render a subtree or touch a service are faster at 2000 components: service edit 1314/1402 to 806/807 ms (about -41%), inner class-field / template-text edits 685-763 to 482-554 ms (about -30%). The same direction holds at 500 components (-15% to -25%).

**No change (the intent was none):** select row, update every 10th row, remove row (all at the same painted frame, 17 / 23 / 29 ms), append 1,000 rows (-3%, within spread), create 1,000 rows (-9% median but the baseline's spread is 56% because of one outlier run, so treat as unproven), create 10,000 rows (-5%, about the spread), deep-chain, wide-fanout, diamond, dynamic-deps, batched-writes, toSignal-chain, toObservable-subscribe, and all `polyfill`/`rxjs` controls (within about +-3%).
Method-only and style-only HMR edits and the inner-target method/style edits were not expected to change much and did not (0 to +1%).

**Possible regressions, not confirmed as meaningful:**

- `toSignal-fan-in / gable` 0.274 to 0.314 ms (+14.5%): confirmed real, then fixed under TASK-19, see "TASK-19: toSignal fan-in follow-up" below.
- HMR leaf-target edits at 2000 components read +7% to +32% slower in the current build (e.g. template text 203/216 to 255/298 ms), and +5% to +11% at 500. The current pair itself varies a lot (255 vs 204 ms for the same row), so with 2 runs per side this is within noise, but there is no sign of a leaf improvement either. A larger run would be needed to settle it.

**Noise caveats:**

- A first reactivity pass (10 runs) was discarded: the second half of it was disturbed by something external on the machine (the unchanged `polyfill` and `rxjs` controls moved +13% to +30% between sides), which is exactly what the controls are for. The 16-run set above was taken afterwards and its controls stay within +-3% except the cases below. The first half of the discarded pass agreed with the final numbers for the wins listed above.
- `effects-sparse / polyfill` (unchanged code) is bimodal between runs (0.15 vs 0.29 ms) and moved -34%; `effects-shared / rxjs` moved +25% on a 0.26 ms base. Treat sub-0.3 ms rows with spreads above 30% as indicative only. The `effects-sparse / gable` win (-57%) is much larger than that bimodality, but a part of it may be shared JIT/GC effects.
- js-framework-benchmark paints are quantized to ~16.7 ms frames; only 4 runs of 20 iterations per side, and the baseline create / clear rows carry occasional 170 ms+ outliers.
- Background Edge/WebView2 processes belonging to the host environment were present (idle) during all runs; a leftover `vite preview` on port 4199 was also running, not used by these measurements.

## TASK-19: toSignal fan-in follow-up

The +14.5% on `toSignal-fan-in` above was reproduced and mostly removed. This section is deliberately candid about how much of the cause is understood.

**Method.** Baseline = `435b332` built in a throwaway git worktree; "HEAD" = `f648502` (the build the table above measured); "fixed" = HEAD plus the TASK-19 change. Each side's `dist` was copied into its own copy of `examples/reactivity-benchmark` (same rxjs 7.8.2 and signal-polyfill 0.2.2), the full suite was run as separate processes alternating A/B/B/A..., 8 runs per side, median of per-run medians (31 samples, 3 warmup). Nothing else heavy ran in parallel; machine drift still produced a few noisy sets (the +14% did not show in about two of six repeats), so only quiet sets with flat controls are quoted.

**Reproduction.** Baseline 0.277-0.282 ms vs HEAD 0.309-0.323 ms across repeats (+10% to +17%), `rxjs` control flat. The gap also exists at steady state (300 samples: 0.230 vs 0.272), so it is not only warm-up.

**What was found.**

- The fan-in scenario touches only: 1,000 `state.set` calls (write path), 1,000 reads in the sum computed, one effect run. The only per-element changes between the two builds on that path are the `writes++` counter that TASK-14 added to every signal write (to detect "first run wrote a signal it read") and the `toSignal` read/write wrapper layers. The per-flush bucket logic runs once per flush and is not the cost.
- Toggling pieces of the TASK-14 diff in the built `dist` (drop `writes++`, drop the read-phase wrapper, make `EffectNode` a plain object with a WeakMap instead of a `Signal.Computed` subclass) gave inconsistent results: only the WeakMap variant closed the gap, but it made `create-dispose` +27% and `toObservable-subscribe` +29% worse, and a Map variant with delete-on-dispose did not close it at all. Removing `writes++` alone was worth about 3%. Under `--no-maglev` the HEAD build was faster than the baseline, and raising V8's inlining budget also closed the gap, so the remainder of the regression is sensitive to JIT inlining decisions in the shared polyfill hot loop and **is not a single algorithmic cost I can point at**. I did not find one line to blame, and the fix below is a reduction of per-write and per-read overhead, not a reversal of an identified mistake.

**Fix** (`packages/core/src/signals.ts`, `packages/core/src/bridge.ts`):

1. `toSignal` now uses a new internal `stateSource()` that returns a read function and a write function directly over one `Signal.State`, instead of a writable `signal()` wrapped in a read-only closure. That removes one call layer from each of the 1,000 reads per run.
2. The write counter is only incremented while an effect's synchronous first run is in progress (`firstRuns > 0`), so ordinary writes pay a load and a branch instead of a read-modify-write of a shared variable. Semantics are unchanged: `effect()` only ever compared the counter across its own first run.

Effect ordering is untouched (`order.test.ts` passes), and a guard test there asserts that 1,000 `toSignal`s feeding one computed cost exactly one effect run per flush over several rounds.

**Result** (8 runs per side, A/B/B/A..., median of run medians, ms, lower is better):

| scenario / impl | baseline 435b332 | HEAD f648502 | fixed | fixed vs HEAD |
|---|---|---|---|---|
| toSignal-fan-in / gable | 0.277 | 0.320 | 0.289 | -9.7% |
| toSignal-fan-in / rxjs (control) | 1.832 | 1.837 | 1.836 | 0.0% |
| effects-shared / gable | 5.395 | 4.312 | 4.394 | +1.9% |
| effects-sparse / gable | 0.671 | 0.274 | 0.266 | -2.9% |
| create-dispose / gable | 4.466 | 1.977 | 2.002 | +1.3% |
| toObservable-emit / gable | 0.943 | 0.720 | 0.736 | +2.2% |
| toObservable-subscribers / gable | 0.397 | 0.072 | 0.072 | 0.0% |
| toObservable-subscribe / gable | 2.327 | 2.273 | 2.309 | +1.6% |
| round-trip / gable | 0.920 | 0.816 | 0.823 | +0.9% |

All other scenarios (deep-chain, wide-fanout, diamond, dynamic-deps, batched-writes, toSignal-chain) stayed within about 3% of both builds. The TASK-14/15 gains are intact (everything else vs HEAD is inside run-to-run spread).

**What is not fully fixed.** At the default 31 samples the fixed build is 0.289 vs the 0.277 baseline (+4%), with overlapping ranges (fixed 0.267-0.298, baseline 0.272-0.288), so it is "back to roughly baseline", not demonstrably below it. At steady state (300 samples, 4 runs per side) the fixed build is ahead: 0.161 ms vs 0.187 for baseline and HEAD (in that particular set HEAD showed no gap, while two earlier 300-sample sets showed HEAD +18%, so the steady-state gap is itself not stable). Because the cause is JIT-sensitive, a future unrelated change near the polyfill hot path could move this scenario by a few percent either way.

## TASK-44: virtual scroll (`useVirtualizer`) against plain `@for`

`examples/virtual-benchmark` renders the js-framework-benchmark rows case (same row data generator, same row component with id, clickable label and remove link) two ways: every row as a node in an `@for` (`?mode=plain`), and through `useVirtualizer` from `@gable/ui-primitives` (`?mode=virtual`: 38 px fixed rows, `getKey` by row id, overscan 5) inside a 400 px scroll container. `node scripts/bench.mjs` builds it, drives headless Chrome with Playwright (the vite and playwright-core of `examples/js-framework-benchmark` are reused) and prints the median of fresh-page runs. Same measurement as the js-framework-benchmark script: click (or scroll assignment) to the next painted frame, quantized to about 16.7 ms.

Chrome 156, 7 fresh pages per cell, median (ms, lower is better). "Rows in DOM" is the row node count after the operation.

| operation | plain `@for` | virtual | rows in DOM (plain / virtual) |
|---|---|---|---|
| create 1,000 rows | 106.8 | 12.1 | 1,000 / 17 |
| create 10,000 rows | 875 | 27.4 | 10,000 / 17 |
| create 100,000 rows | 9,380 | 43.5 | 100,000 / 17 |
| update every 10th row (10,000) | 59.3 | 16.1 | 10,000 / 17 |
| jump to the middle (100,000 rows) | 61.9 | 15.8 | 100,000 / 17 |
| scroll, median frame time over 60 frames of 10 rows (100,000 rows) | 36.7 | 16.7 | 100,000 / 17 |

**Reading it.** Rendering cost with virtual scroll no longer depends on the row count: creating 100,000 rows costs one visible window plus the engine's `O(n)` setup (a key per row, a size per row and prefix sums, 16.9 ms of script at 100,000 rows, a typed-array fill and one `getKey` call per row). The non-virtual 100,000 rows case is dominated by layout and paint of 100,000 nodes, not by Gable's reconcile (script time was 18 ms there too). A virtual list holds at the 16.7 ms frame floor while scrolling because a scroll step swaps only the rows that left the window: the `@for` keyed by the item's key moves the rest.

**Caveats.** Fixed row height only (variable heights add a ResizeObserver callback per newly rendered row and a prefix-sum recompute from the changed index; not measured here). The virtual column starts every operation from an empty store, so "update" touches the visible rows only by design (a row outside the window is not rendered; its data is updated). Frame times are quantized, and these are 7 runs on one machine: treat differences under about 5 ms as noise. The engine is Gable's own (`virtual-core.ts`), not `@tanstack/virtual-core`; see `docs/ui-primitives.md`.
