# Frame cost of Gable signals and effects under high-rate state

Fact-finding for backlog TASK-104.6. Facts and measurements only; no design recommendations.

## Machine

- Intel Core i9-9900KF @ 3.60 GHz, 16 logical cores, 63.9 GB RAM
- Windows 11 (win32 10.0.26200), x64
- Node v24.21.0, vitest 5.1.0
- Run date 2026-11-12, repo commit 3303cee plus the files in this branch

## Item 2: how the flush is scheduled (source: `packages/core/src/signals.ts`, `internal.ts`, `index.ts`)

- Gable signals are `signal-polyfill` (TC39 proposal) `Signal.State`/`Computed`. Each `effect()` is an `EffectNode` (a `Signal.Computed`) put in a bucket of up to `BUCKET_SIZE = 32` effects, each bucket with one `Signal.subtle.Watcher`.
- A `signal.set()` marks dependent effects dirty synchronously. The watcher notify callback only records the bucket in `dirtyBuckets` and calls `schedule()`.
- `schedule()` is `scheduled ??= Promise.resolve().then(flushNow)` (signals.ts:224-226). The flush is a **microtask**. It is not tied to `requestAnimationFrame`, a timer, or a frame boundary; `signals.ts` has no reference to rAF.
- `flushNow()` loops: collect pending effects from dirty buckets, sort by scope depth then creation order, run each via `node.get()`; effects that write signals re-arm buckets and trigger another round. When no effects are pending it shifts one `afterFlush` task (from `runAfterFlush`), runs it, and loops again. So after-flush tasks run after effects settle, one at a time, with effects re-flushed between them.
- `MAX_FLUSH_ROUNDS = 1000` (signals.ts:236). A round that finds pending effects increments `rounds`; at round 1001 it calls `reportError(new Error("Effects did not settle after 1000 rounds ..."))` and `break`s out of the loop (remaining pending effects are not run in that flush).
- `flushSync()` (signals.ts:302) is `if (scheduled) flushNow();` it runs the pending flush synchronously. The already-queued microtask still runs later and finds nothing pending.
- Public surface: `packages/core/src/index.ts` exports from `signals.js` only `signal, computed, effect, untracked` (and the types `ReadonlySignal, WritableSignal, SignalOptions`).
  - `flushSync`, `whenFlushed`, `hasPendingFlush` are exported only from `@gable/core/internal` (internal.ts:9), documented as "Not part of the public API; may change without notice."
  - `runAfterFlush` is `export`ed from `signals.ts` but is **not** re-exported by `index.ts` nor `internal.ts`; only `router-state.ts` and `rxjs.ts` inside core import it.
- Effects versus a rAF callback (derived from the HTML Standard, not measured here, no browser was run): the "run the animation frame callbacks" step invokes each callback with "invoke a callback function", whose "clean up after running script" step performs a microtask checkpoint when the JS execution context stack is empty. So a signal write inside a rAF callback queues `flushNow` as a microtask, and it runs immediately after that callback returns (before the next rAF callback in the same frame, and before the "update the rendering" style/layout/paint steps that follow all callbacks). A write made in a rAF callback is therefore flushed before the paint of that same frame, provided nothing in the callback throws before returning and the flush finishes (a long flush delays the paint). A write made outside rAF (event, timer, network) is flushed at the next microtask checkpoint, i.e. before the next rAF callback, with no frame alignment. Sources: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#run-the-animation-frame-callbacks, https://webidl.spec.whatwg.org/#invoke-a-callback-function, https://html.spec.whatwg.org/multipage/webappapis.html#clean-up-after-running-script.
- Effects run inside `flushNow` in the order parent scope first, then creation order. In DEV with devtools timing attached, `flushNow` also calls `performance.now()` per effect; the bench below ran without devtools attached.

## Items 1 and 3: measurements

Script: `docs/research/frame-cost-model/bench.test.ts`, run with
`npx vitest run --config docs/research/frame-cost-model/vitest.config.ts` from the repo root (config: `docs/research/frame-cost-model/vitest.config.ts`). Raw JSON: `docs/research/frame-cost-model/results.json`.

Method:
- A `mount()`ed component from `@gable/testing` with `@for (e of entities; track e.id) {<i ...></i>}`; `[x]`, `[y]`, `[rotation]` are property bindings on `<i>`. The test renderer (`createTestRenderer`) is wrapped only to count `setProperty` calls. No DOM, no GPU.
- Each frame: write every entity's state (values change every frame), then flush. Write and flush are timed separately with `performance.now()`. 30 warm-up frames (discarded), then 300 measured frames. Median and p95 are over those 300 frames, in ms.
- After the last frame the script checks that the last entity's node has the new values (bindings really ran).
- Variants:
  - **A**: 3 signals per entity (`x`, `y`, `r`), 3 bindings (`[x]="e.x()"` etc.), flushed with `flushSync()`.
  - **A'**: same as A but flushed by `await Promise.resolve()` (the real microtask path) instead of `flushSync()`.
  - **B** (ref fast path): plain `x/y/rotation` fields assigned in a loop on stub objects. No signals, no effects, no flush.
  - **C1**: one signal per entity holding a fresh immutable `{x,y,rotation}` object each frame, three bindings reading `e.s().x`, `e.s().y`, `e.s().rotation`.
  - **C2**: one signal per entity (immutable pose), ONE binding per entity (`[pose]="e.s()"`).
- `setProperty` calls per frame were counted: A, A', C1 = 3 per entity; C2 = 1 per entity (no extra or missing calls).

All times in ms per frame. "props" is bound properties per frame (N x 3, or N for C2).

| Variant | N | props | write med | write p95 | flush med | flush p95 | total med | total p95 |
|---|---|---|---|---|---|---|---|---|
| A | 100 | 300 | 0.042 | 0.062 | 0.175 | 0.287 | 0.217 | 0.340 |
| A' | 100 | 300 | 0.035 | 0.048 | 0.150 | 0.219 | 0.185 | 0.266 |
| B | 100 | 300 | 0.001 | 0.005 | 0 | 0 | 0.001 | 0.005 |
| C1 | 100 | 300 | 0.017 | 0.020 | 0.164 | 0.188 | 0.180 | 0.212 |
| C2 | 100 | 100 | 0.011 | 0.020 | 0.055 | 0.071 | 0.066 | 0.087 |
| A | 1000 | 3000 | 0.378 | 0.563 | 1.560 | 2.008 | 1.942 | 2.511 |
| A' | 1000 | 3000 | 0.386 | 0.487 | 1.578 | 1.866 | 1.968 | 2.304 |
| B | 1000 | 3000 | 0.005 | 0.006 | 0 | 0 | 0.005 | 0.006 |
| C1 | 1000 | 3000 | 0.211 | 0.340 | 1.717 | 2.201 | 1.929 | 2.516 |
| C2 | 1000 | 1000 | 0.154 | 0.289 | 0.620 | 1.006 | 0.772 | 1.321 |
| A | 2000 | 6000 | 1.519 | 2.685 | 4.646 | 6.378 | 6.181 | 9.034 |
| A' | 2000 | 6000 | 1.435 | 2.164 | 4.616 | 5.736 | 6.086 | 7.709 |
| B | 2000 | 6000 | 0.010 | 0.010 | 0 | 0 | 0.010 | 0.010 |
| C1 | 2000 | 6000 | 0.570 | 0.984 | 4.483 | 5.746 | 5.070 | 6.681 |
| C2 | 2000 | 2000 | 0.331 | 0.460 | 1.198 | 1.737 | 1.537 | 2.176 |
| A | 3000 | 9000 | 3.090 | 4.018 | 8.208 | 9.936 | 11.360 | 14.100 |
| A' | 3000 | 9000 | 3.404 | 4.110 | 8.604 | 9.647 | 12.015 | 13.651 |
| B | 3000 | 9000 | 0.009 | 0.009 | 0 | 0 | 0.009 | 0.009 |
| C1 | 3000 | 9000 | 1.489 | 2.134 | 7.323 | 8.370 | 8.828 | 10.507 |
| C2 | 3000 | 3000 | 0.460 | 0.889 | 2.147 | 3.908 | 2.607 | 4.785 |
| A | 4000 | 12000 | 5.336 | 5.989 | 12.478 | 13.736 | 17.840 | 19.582 |
| A' | 4000 | 12000 | 5.339 | 6.191 | 12.586 | 14.228 | 17.937 | 20.330 |
| B | 4000 | 12000 | 0.011 | 0.011 | 0 | 0 | 0.011 | 0.011 |
| C1 | 4000 | 12000 | 2.563 | 3.280 | 11.289 | 12.498 | 13.858 | 15.545 |
| C2 | 4000 | 4000 | 0.994 | 1.398 | 4.348 | 5.323 | 5.343 | 6.620 |
| A | 5000 | 15000 | 6.724 | 7.607 | 16.312 | 17.687 | 23.048 | 25.178 |
| A' | 5000 | 15000 | 6.195 | 7.026 | 16.003 | 17.274 | 22.225 | 24.115 |
| B | 5000 | 15000 | 0.025 | 0.029 | 0 | 0 | 0.025 | 0.029 |
| C1 | 5000 | 15000 | 3.550 | 4.156 | 14.629 | 16.303 | 18.209 | 20.322 |
| C2 | 5000 | 5000 | 2.334 | 3.295 | 6.093 | 7.329 | 8.500 | 10.544 |

(An earlier run of N = 100, 1000, 5000 gave totals within about 15% of these, e.g. A at 5000: 19.6 ms median, 22.5 ms p95, so run-to-run noise at the high end is a few ms.)

### Reading the numbers against 16.7 ms (60 Hz)

- At 1000 entities x 3 properties (3000 bound properties), the signal path A costs 1.9 ms median, 2.5 ms p95 per frame, about 12-15% of 16.7 ms. At 1000 bound properties total (C2, N = 1000) it is 0.77 ms median, 1.3 ms p95. Both are inside the budget on this machine, in this harness.
- Per-frame total for A grows roughly linearly with properties: about 1.3 microseconds per bound property at 3000 props, rising to about 1.5 microseconds at 15000 props (the 1000 to 2000 step is superlinear: 3x for 2x).
- Variant A stops fitting in 16.7 ms: median is 11.4 ms at 3000 entities (9000 props) and 17.8 ms at 4000 entities (12000 props); p95 is 14.1 ms at 3000 and 19.6 ms at 4000. So the p95 crosses the budget between 9000 and 12000 bound properties and the median crosses it by 12000.
- C1 (one signal, three bindings) crosses later: median 13.9 ms / p95 15.5 ms at 12000 props (under), 18.2 / 20.3 ms at 15000 props (over).
- C2 (one signal, one binding) is at 8.5 ms median, 10.5 ms p95 at 5000 entities (5000 props), still inside the budget at every size tested. C2 runs one effect per entity instead of three, and its total is about 0.37x A's at 5000 entities (8.5 vs 23.0 ms), so in these runs cost tracks the number of effects re-run more than the number of properties.
- The flush (effect re-run) dominates: 75-80% of A's total at 1000 and above. The write step is 17-30%.
- B (direct field writes) is 0.001 ms at 100 entities, 0.005 ms at 1000, 0.025 ms at 5000: about 2-3 orders of magnitude below A. It performs no rendering work; it measures only the cost of the stores themselves, so it is a floor, not an equivalent of A.
- "Total" excludes everything after `setProperty` in a real renderer (DOM mutation, style, layout, paint, GPU), and excludes game logic that computes the new state.

## Caveats

- Not a browser. The test renderer's `setProperty` stores into `props` on an in-memory object; a real DOM/canvas renderer's `setProperty` would add its own cost on top of the effect cost.
- Node (V8) on a desktop i9-9900KF, with 63.9 GB RAM and no throttling. Mobile or lower-power CPUs will be slower by an unmeasured factor.
- p95 over 300 frames includes any GC pauses that fell in the measured frames (C1/C2 allocate a new pose object per entity per frame; A allocates none in the write step). GC was not isolated.
- The rAF/microtask ordering in item 2 is from the HTML/WebIDL specs and the Gable source, not from a browser run in this task.
- Single value pattern: every signal changes every frame. Frames where only a fraction of entities change would cost less (effects only re-run when their dependencies changed); that was not measured.
- `@for` keyed by a stable id; the entity list itself never changes during the measured frames. Mount cost (creating N x 3 effects) is not measured.
- A' used `await Promise.resolve()` as the flush wait, which resolves in the microtask queue after the scheduled `flushNow` (queued earlier), so it exercises the production scheduling path; its numbers match A within noise.
- No devtools were attached, so DEV per-effect timing hooks were off.
