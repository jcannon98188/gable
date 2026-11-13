# Frame-flush optimisation (TASK-105.17)

The four gated steps of TASK-104.14, each profiled and measured before it was kept. The scene is the canvas benchmark's three-signal style at 5,000 entities: every entity writes three signals per frame, so a frame's flush re-runs 15,000 binding effects.

## Result

| | flush p50 at 5,000 entities, `signals` style | `shared` style |
| --- | --- | --- |
| before (a3ab114) | 22.2 ms | 22.4 ms |
| after | 15.9 ms | 16.2 ms |
| change | **-28%** | **-28%** |

The target was 30 percent. The kept changes of steps 2 and 3 reach about 28 percent, and step 1 (native brand checks, vendored polyfill) takes the flush to about 41 percent below a3ab114 (see step 1); the shortfall and what would close it are in [What is left](#what-is-left).

All kept changes are behaviour-preserving and the existing tests pass unchanged.

## Method

- `examples/canvas-benchmark/scripts/run.mjs`: headless Chromium (Playwright), software GL, production-minified page, 300 measured frames after 60 warm-up frames. "Flush" is the benchmark's flush phase: end of the frame hooks to the start of `Application.render` (`flushSync` plus the renderer's per-frame redraw).
- The machine (i9-9900KF, Windows 11) was shared with other jobs and run-to-run noise reached 20 percent, so every comparison is **interleaved**: variant A, variant B, A, B, and so on, one page load each, each building the page from its own checkout (`--src`). The figure quoted is the median of the per-run p50s; "n/n rounds" says in how many rounds the variant beat the one it was paired with.
- Profiles: `examples/canvas-benchmark/scripts/profile.mjs` (added by this ticket). It records a CPU profile at a 100 microsecond sampling interval and reports self time per function over the samples that have `flushSync` on the stack. It builds the page unminified so names are real; use it for attribution, not for absolute numbers.

## Baseline profile

Self time under `flushSync`, 360 frames, 8,724 ms sampled:

| share | function | whose |
| --- | --- | --- |
| 16.9% | `setProperty` | renderer-pixi |
| 11.4% | `consumerPollProducersForChange` | signal-polyfill |
| 10.7% | `__privateIn` | signal-polyfill |
| 7.3% | `flushNow` | core |
| 5.3% | the binding effect | core |
| 4.3% | `resolveCallee` | core |
| 3.7% | `byDepthThenCreation` | core |
| 3.6% | `_updateSkew` | Pixi (the rotation setter) |
| 3.3% | `lookup` (expression names) | core |
| 2.8% | the effect wrapper closure | core |
| 2.7% | `producerUpdateValueVersion` | signal-polyfill |
| 2.3% | `lookup` (property table) | renderer-pixi |

Time spent in V8 builtins is charged to the calling function, which matters below: `__privateIn` is `WeakSet.prototype.has`, and most of `setProperty` turned out to be a `WeakMap` lookup and a computed property store.

## Step 1: `__privateIn`

**Finding.** Gable's build target is already ES2022. The helper is inside signal-polyfill 0.2.2's published `dist/index.js`: upstream's `vite.config.ts` sets no `build.target`, so Vite's default lowers `#brand in obj` to a `WeakSet` lookup. `State.get`, `State.set` and `Computed.get` each run one such brand check, which is two per binding effect in a flush and six per entity in the hooks.

**Measured.** `dist/index.js` was patched in place so the three brand checks are native (`#brand in s`), which is what an ES2022 build of upstream emits, and compared with the stock file:

| measured on | flush | hooks | JS total |
| --- | --- | --- | --- |
| the baseline, 4 rounds | +5.6% (inside the noise that day) | -17% | 0% |
| the branch after the first three step 2 commits, 5 rounds, quiet machine | **-6.5%** (5/5 rounds) | -16% | -8% |

**Decision: applied, vendored.** The upstream fix is one line in `vite.config.ts` of proposal-signals/signal-polyfill, filed as proposal-signals/signal-polyfill#64:

```diff
   build: {
     minify: false,
+    target: 'es2022',
     lib: {
```

Upstream's last commit is from February 2025 and its last release (0.2.2) from January 2025, with 16 pull requests open, so the project decided to vendor a rebuilt copy now. `packages/core/src/vendor/signal-polyfill/` holds the 0.2.2 source at upstream `1c33f91`, compiled by core's own ES2022 build, and `@gable/core` no longer depends on the npm package (ADR 0021). A test fails if the emitted polyfill contains `__privateIn` or `__privateAdd`.

**Measured after applying** (interleaved, one page load per run, 300 frames after 60 warm-up, 5,000 entities, medians of the per-run p50s). The integration tip ab1bef8 against this branch, both built from checkouts that share one `node_modules`:

| style | rounds | flush before | flush after | hooks | JS total | render (control) |
| --- | --- | --- | --- | --- | --- | --- |
| `signals` | 6 | 14.15 ms | 12.00 ms (**-15.2%**, 6/6 rounds) | 10.15 to 8.45 ms (-17%) | 27.7 to 23.5 ms (-15%) | 2.4 to 2.5 ms |
| `shared` | 6 | 13.80 ms | 11.95 ms (**-13.4%**, 6/6 rounds) | 6.25 to 5.55 ms (-11%) | 23.3 to 20.5 ms (-12%) | 2.4 to 2.4 ms |

Against the original baseline a3ab114 (4 rounds): `signals` flush 20.8 to 12.25 ms (-41%), JS total 34.0 to 24.05 ms (-29%); `shared` flush 21.25 to 12.05 ms (-43%), JS total 30.15 to 20.45 ms (-32%). The flush phase there includes the shift described in ADR 0021 (transform writes moved into the render phase between a3ab114 and the tip, render 1.3 to 2.4 ms), so JS total is the fairer figure: **-29% and -32%**. Against the 30 percent target on the flush phase, the target is met; on total JavaScript per frame it is met for `shared` and about one point short for `signals`.

Profile (unminified, `signals`, 5,000): `__privateIn` was 12.8 percent of the samples under `flushSync` and is gone; `isStateImpl` is about 1 percent. Sampled flush time fell from 3,458 ms to 2,802 ms.

The Node microbench (no browser, 8 interleaved rounds) shows only -2.5 percent (`signals`) and -2.9 percent (`shared`) on flush, and its `ref` control style (no signals) drifted +15 percent, so it cannot resolve an effect this size and is not evidence either way. On the polyfill's own benchmark (js-reactivity-benchmark, 5 interleaved rounds) the native build ran propagation tests at 0.91 of stock and all tests at 0.90, node creation at 0.06 to 0.24 and updates at 0.23 to 0.74.

**A caveat about method.** A first comparison against a separate checkout with its own `node_modules` read the new build 30 percent *slower* in all 5 rounds, with the render phase (which no polyfill code touches) 40 percent slower too. The likely cause: the benchmark page built with `--src` resolves `pixi.js` for the renderer package from that checkout and for the benchmark source from the main one, so the baseline ran with a different Pixi arrangement. The same base code built with a shared `node_modules` (an NTFS junction) behaved like the new build in the render phase, and that is the comparison above. Check that the render phase stays flat between variants. Earlier interleaved figures in this file that used separate checkouts may carry the same effect.

## Step 2: Gable's own code

Each row was measured against the commit before it.

| change | flush | kept |
| --- | --- | --- |
| `flushNow`: check the order while collecting pending effects and sort only when they are out of order (they normally are not); the effect node carries its scope's depth. Effects share one computation function instead of a closure each, and a run no longer allocates a closure. `applyBindings`: the binding's guard written inline, no closure per run. `evaluate`: a call of a plain name (`count()`) no longer allocates a result pair; a scope with no template locals skips the map lookup. renderer-pixi `setProperty`: how a property name is written is resolved once per tag, not on every write. | -14.5% (5 rounds, measured together) | yes |
| `signal()`: the read function is `state.get` bound to the state, not a closure over it | -5.7% (5/5 rounds) | yes |
| renderer-pixi: a display node carries its tag info as a symbol-keyed property; no `WeakMap` lookup per property write | -3.4% (5/5 rounds) | yes |
| renderer-pixi: `x`, `y`, `rotation`, `angle` and `alpha` are assigned by name, the rest by computed name as before | **-14.4%** (4/4 rounds) | yes |
| `lookup`: read the instance member first and ask `in` only when it is undefined | -1.3% (2/4 rounds) | no, reverted |

The largest single win was the last kept row. `target[name] = value` with a name that varies from call to call, landing on a Pixi prototype accessor, takes V8's generic store path on every write; a named store is cached per node class. Only `x`, `y` and `rotation` are exercised by the benchmark; `angle` and `alpha` are the same mechanism and were added with them.

## Step 3: signal-polyfill notify and poll paths

After step 2 the polyfill is the largest block of the flush (table below), so the condition for this step holds. No polyfill change was made:

- `__privateIn` is step 1: measured, worth about 6 percent of flush, waiting on the upstream-or-vendor decision.
- `consumerPollProducersForChange` is a loop that, for a binding effect, compares one stored version with one field of one producer. Its 15 percent is not work that a patch removes: it is the first read of the signal node in the flush, and that read misses the cache. The evidence that first reads carry much of the cost: per-entity flush cost in the Node microbench is 2.3 microseconds at 500 entities and 4.2 at 5,000 (same code, no browser), and in the browser 2.7 at 50 entities against 3.7 at 5,000. Removing it means changing how the polyfill lays out a signal (wrapper object, node object, three arrays per consumer), which is a rewrite, not a patch to send upstream.
- The notify path (`producerNotifyConsumers`, 15 percent in the spike's whole-frame profile) runs in the hooks phase, when signals are written. It is not flush time and was not in scope here.

## Step 4: one effect per node

A prototype coalesced a node's property, attribute, class and style bindings into one effect that evaluates each expression and applies the values that changed. All existing tests passed with it.

**Measured** (5 rounds, three variants interleaved): baseline 24.8 ms, step 2 as it then stood 21.2 ms, step 2 plus coalescing 20.1 ms. That is about 5 percent on top of step 2.

**Decision: not kept.** The gain is small, and it is not behaviour-preserving in two ways that no existing test covers:

- a binding's expression is evaluated whenever any binding of the same node is re-run, not only when its own dependencies change (visible when a template calls a method);
- a binding whose dependencies changed but whose value did not is no longer re-applied. On the DOM that changes what happens to state the user altered, such as typed text under `[value]`.

Keeping one effect per binding whenever the devtools are attached (their reports are per binding) would also make development differ from production.

## Final profile

Self time under `flushSync`, 360 frames, 6,641 ms sampled (8,724 ms before):

| share | function | whose |
| --- | --- | --- |
| 15.1% | `consumerPollProducersForChange` | signal-polyfill |
| 14.9% | `__privateIn` | signal-polyfill |
| 10.2% | the binding effect | core |
| 8.3% | `lookup` (expression names) | core |
| 7.3% | `_updateSkew` | Pixi |
| 6.5% | `flushNow` | core |
| 4.5% | `producerAccessed` | signal-polyfill |
| 3.2% | `evaluate` | core |
| 3.1% | `set x` (ObservablePoint) | Pixi |
| 3.0% | `producerUpdateValueVersion` | signal-polyfill |
| 2.8% | `set x` (Container) | Pixi |
| 2.4% | `producerRecomputeValue` | signal-polyfill |
| 1.8% | `setProperty` | renderer-pixi |

`setProperty` fell from 16.9 percent to 1.8; `byDepthThenCreation`, `resolveCallee` and the effect wrapper closure are gone from the table. signal-polyfill is now about 45 percent of the flush and Pixi's own setters about 15.

## Final measurement

Baseline a3ab114 against the branch head, interleaved:

| style | rounds | flush before | flush after | change | per-round range |
| --- | --- | --- | --- | --- | --- |
| `signals`, 5,000 | 6 | 22.2 ms | 15.9 ms | -28.4% | -20% to -43% (the machine was busy in rounds 3 to 6) |
| `shared`, 5,000 | 4 | 22.4 ms | 16.2 ms | -27.7% | -24% to -30% |
| `ref`, 5,000 | 2 | 0.0 ms | 0.0 ms | none | the style has no bindings |

After merging the integration branch (which added `a11y`, `dynamicProperties` and hit children to `setProperty`), the integration tip against the merged head, 4 rounds, `signals` style: 21.8 ms to 15.6 ms, -28.4%.

Other phases: in the `signals` style the hooks did not get slower (13.9 ms before, 12 to 15 ms after depending on load). In the `shared` style the hooks read 9.3 ms against 8.6 ms (worse in 4 of 4 rounds, about 0.14 microseconds per entity) for a reason not found; total JS time for that style still fell 14 percent (33.8 to 29.0 ms).

## What is left

Before step 1 was applied the flush was about 2 points short of the 30 percent target (step 1 closed it, see above). What remains, from the final profile:

1. **Native brand checks in signal-polyfill (step 1).** Done by vendoring a rebuilt copy.
2. **The polyfill's memory layout.** Roughly a third of the flush is first reads of polyfill objects. Only a different signal implementation changes that.
3. **Pixi's setters** (about 15 percent, `_updateSkew` alone 7) are paid by the `#ref` style too and are not Gable's to change.
4. **Expression name lookup** (8 percent) is the remaining piece in Gable's own code. The one variant tried (read before `in`) did not measurably help.
