# Pixi renderer spike: performance budget and HMR behaviour

Throwaway prototype in `prototypes/pixi-renderer/` (branch `prototype/pixi-renderer-spike`). It answers two open questions about a Pixi-rendered `<gable-canvas>` by measurement. Everything below is measured unless it is labelled **unmeasured**. Raw data is in `prototypes/pixi-renderer/results/`.

## What was built

- Additive core changes (`packages/core`): `ComponentMeta.renderer` (a component can declare a `RendererBoundary { renderer, root }`; its template, projected slot content and everything nested are built with that renderer), optional `Renderer.destroy()`, `onCleanup(fn)`, and `flushSync`/`untracked`/`signal`/`computed`/`effect`/`whenFlushed` exported from the index. Three tests in `packages/testing/src/boundary.test.ts`; `vitest run packages/core` plus that file passes (99 tests).
- `src/pixi-renderer.ts`: a `Renderer<Container>` for Pixi 8.23 (container, sprite and related nodes; the scene is built without an Application).
- `src/gable-canvas.ts`: a DOM-hosted component. Its host stays a DOM element, it creates a Pixi `Application` after Setup (Pixi 8 init is async), attaches the scene root to the stage, and **Gable owns the one rAF loop**: frame hooks, then `flushSync()`, then one `app.render()`. Pixi's ticker is off. A `Frame` service holds the hooks.
- Demo game (`src/demo/`, `index.html`) with a DOM HUD bound through DI to the same `GameState` signals the canvas entities use.
- Benchmark (`bench.html`, `driver/bench.mjs`) and HMR driver (`driver/hmr.mjs`), profile driver (`driver/profile.mjs`).

## Machine

Intel i9-9900KF @ 3.6 GHz, 64 GB, NVIDIA GeForce RTX 2060 SUPER, Windows 11. Chromium revision 1243 (Playwright binaries, launched by path). Display refresh capped at 60 Hz (rAF-to-rAF p50 16.7 ms).

**Real GPU was used** for the main runs: WebGL renderer string `ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 SUPER ... Direct3D11 ...)`, reached with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --disable-gpu-sandbox`. The headless default is SwiftShader (software); one SwiftShader grid is included for contrast. Benchmarks ran the production build (`__GABLE_DEV__=false`, minified). HMR ran against the dev server.

## Method

Per configuration: fresh page, mount N entities, 120 warm-up frames, then 600 measured frames; 3 repetitions (d3d11 capped), 2 (uncapped, finish), 1 (SwiftShader). Table values are the median across repetitions of each repetition's p50. Phases are timed with `performance.now()` inside the Gable loop: (a) frame hooks (the entities' own `onFrame` logic writing state), (b) `flushSync()` (Gable effects applying state to Pixi nodes), (c) `app.render()` (Pixi's CPU-side render submit). "JS total" is a+b+c. "Frame" is rAF-to-rAF. "Dropped" is the bench page's count of missed 60 Hz frames over the 600 measured (see `bench.ts` for the exact rule).

Entity styles:
- **signals**: each entity has 3 signals (x, y, rotation), each bound separately in the template.
- **pose**: 1 signal per entity feeding 1 binding (`pose`, which sets x, y and rotation in the renderer).
- **ref**: no signals; the hook writes straight to the Pixi node obtained through `#ref`.
- **particles**: a `ParticleContainer` with N `Particle`s, written directly from the hook.

## Performance (real GPU, capped to 60 Hz, ms, median of 3 reps)

| style | N | hooks | flush | render submit | JS total p50 | JS total p95 | frame p99 | dropped / 600 |
|---|---|---|---|---|---|---|---|---|
| signals | 500 | 0.60 | 1.00 | 0.20 | 1.70 | 2.00 | 16.8 | 0 |
| signals | 1,000 | 1.10 | 2.00 | 0.30 | 3.40 | 4.10 | 16.8 | 0 |
| signals | 2,000 | 2.20 | 4.20 | 0.50 | 7.00 | 7.70 | 16.8 | 0 |
| signals | 3,000 | 3.30 | 6.50 | 0.70 | 10.50 | 11.50 | 16.8 | 0 |
| signals | 5,000 | 5.80 | 11.20 | 1.30 | 18.40 | 19.60 | 33.4 | 76 |
| signals | 10,000 | 12.60 | 25.20 | 3.80 | 41.90 | 44.40 | 50.1 | 600 |
| pose | 500 | 0.30 | 0.40 | 0.10 | 0.80 | 1.00 | 16.8 | 0 |
| pose | 1,000 | 0.50 | 0.70 | 0.20 | 1.50 | 1.90 | 16.8 | 0 |
| pose | 2,000 | 1.20 | 1.50 | 0.50 | 3.20 | 3.60 | 16.8 | 0 |
| pose | 3,000 | 1.70 | 2.40 | 0.60 | 4.70 | 5.20 | 16.8 | 0 |
| pose | 5,000 | 2.70 | 4.10 | 1.20 | 7.90 | 8.80 | 16.8 | 0 |
| pose | 10,000 | 5.60 | 8.80 | 2.50 | 16.90 | 18.30 | 33.4 | 21 |
| ref | 500 | 0.20 | 0 | 0.20 | 0.40 | 0.60 | 16.8 | 0 |
| ref | 1,000 | 0.40 | 0 | 0.20 | 0.70 | 0.90 | 16.8 | 0 |
| ref | 2,000 | 0.80 | 0 | 0.50 | 1.30 | 1.50 | 16.8 | 0 |
| ref | 3,000 | 1.20 | 0 | 0.70 | 1.90 | 2.20 | 16.8 | 0 |
| ref | 5,000 | 2.00 | 0 | 1.20 | 3.30 | 3.70 | 16.8 | 0 |
| ref | 10,000 | 3.90 | 0 | 2.20 | 6.10 | 6.70 | 16.8 | 0 |
| particles | 10,000 | 0.20 | 0 | 0.20 | 0.40 | 0.60 | 16.8 | 1 |
| particles | 20,000 | 0.50 | 0 | 0.50 | 1.00 | 1.30 | 16.8 | 0 |
| particles | 50,000 | 1.30 | 0 | 1.00 | 2.30 | 2.80 | 16.8 | 0 |
| particles | 100,000 | 2.10 | 0 | 1.80 | 3.90 | 4.60 | 16.8 | 0 |

Mount time (median, ms): signals 27 / 39 / 56 / 79 / 116 / 237 for 500 / 1k / 2k / 3k / 5k / 10k; ref 22 to 152 over the same range.

Reading the table:
- The flush is the dominant Gable cost: roughly 2.2 us per entity for the 3-signal style (about 0.75 us per binding write), against roughly 0.8 us per entity for the single-pose style. The render submit is small by comparison (1.3 ms at 5k, 3.8 ms at 10k) and does not depend on how the nodes were updated.
- A 16.7 ms frame is breached at 5,000 entities with three live bindings each (JS p50 18.4 ms, 76 of 600 frames dropped) and at 10,000 with one binding each (16.9 ms, 21 dropped). Using half the frame (about 8 ms) as the budget for the whole loop, the measured ceilings on this machine are about 2,000 entities for 3 bindings each, about 5,000 for 1 binding, and 10,000 or more for direct `#ref` writes. These are the entities' own trivial hooks plus Gable plus Pixi; a real game's logic adds to the hooks column.
- `ParticleContainer` with direct writes: 100,000 particles cost 3.9 ms JS (not tried above 100,000).

### Uncapped (vsync and frame-rate limit disabled, real GPU, 2 reps)

Frame p50 tracks JS total p50 closely at every size (for example signals 5,000: JS 18.7 ms, frame 19.0 ms; ref 10,000: JS 5.9 ms, frame 6.1 ms; particles 100,000: JS 4.4 ms, frame 4.5 ms). On this GPU the frame is limited by the JS side, not the GPU, at these sizes. Full table: `results/d3d11-uncapped.json`.

### `gl.finish()` probe

The `--finish` option records `gl.finish()` after each render. It returned about 0.00 ms in every configuration (`results/d3d11-capped-finish.json`), so under ANGLE/Chromium it does not measure GPU completion and gives no information. **GPU execution time is unmeasured.** The uncapped result above is only indirect evidence that the GPU was not the limit.

### SwiftShader (software GL, 1 rep, capped)

JS total p50: signals 2.9 / 5.6 / 11.7 / 30.2 ms at 500 / 1k / 2k / 5k (5k: 494 of 600 frames dropped); pose 5,000: 17.6 ms (179 dropped); ref 5,000: 5.5 ms (181 dropped, frame p99 33.4 ms). JS-side phases are about 1.5 to 2x slower than the real-GPU run, plausibly because the software rasteriser shares CPU cores with the page (cause not isolated). Do not use these for budgets; they show what CI-style headless Chromium would report. `results/swiftshader-capped.json`.

## CPU profile, 5,000 entities, signals style

CDP `Profiler` (200 us sampling) on an unminified build (`PROFILE=1`), covering mount, warm-up and the 600 measured frames, idle time excluded: 15.4 s sampled. Top self-time functions:

| share | function | what it is |
|---|---|---|
| 15.0% | `producerNotifyConsumers` | signal-polyfill: propagating a signal write to its consumers |
| 10.9% | `setProperty` | the Pixi renderer's property setter (includes inlined Pixi setters) |
| 9.8% | `__privateIn` | esbuild's `#x in obj` brand-check helper, called by signal-polyfill |
| 7.6% | `consumerPollProducersForChange` | signal-polyfill: re-validating effects |
| 7.5% | `evaluate` | Gable template expression evaluation |
| 4.0% | `flushNow` | Gable effect flush loop |
| 3.3% | bench entity hook | the entities' own hook code |
| 2.9% | anonymous in core (line 3635) | binding apply function |
| 2.8% | `read` | Gable signal read wrapper |
| 2.8% / 2.0% / 1.8% | Pixi `_updateSkew`, `packQuadAttributes`, `updateLocalTransform` | Pixi transform and vertex work |
| 2.1% | `byDepthThenCreation` | the flush's sort of pending effects |

Signal-polyfill internals (the notify, poll, brand-check, accessed, update-version and assert entries) sum to roughly 36% of sampled time. That is the lever if the flush cost matters: fewer signals per entity (see pose vs signals above), or direct writes for hot paths. The full list is in `results/profile-signals-5000.json`.

## HMR

**Path used: the real one.** The driver edits source files on disk under a running Vite dev server; Vite's HMR delivers the update, the generated accept lines call Gable's runtime (`packages/core/src/hmr.ts`), and the driver waits for `vite:afterUpdate`. `applyUpdate` was not called directly. Each experiment makes 5 successive edits (the second run, `results/hmr-ticks.json`, 3 edits of four of the experiments with a tick-rate probe). All source files were restored afterwards (checked with `git status`). The page never fully reloaded in any edit.

Gable's classification per edit, from the devtools `hmrLog`:

| experiment | edit | Gable status | Application / canvas / GL context | existing entities | service / world instance | frame hooks | Pixi leaks |
|---|---|---|---|---|---|---|---|
| a1 | ship template (tint) | `GameShip:view` | same | all nodes survive; ship node rebuilt, rocks untouched | same | no change in count | none seen |
| a2 | rock template (tint, inside `@for`) | `GameRock:view` | same | every rock rebuilt (0 of ~46 fresh rocks kept the same node object); the rest of the stage survives | same | live count tracks rock count | none seen |
| b1 | rock hook body (field initialiser) | `GameRock:resetup` | same | rocks re-created (stage reduced to its 7 surviving nodes, then repopulated) | same | every rock re-registers its hook (registered-ever count +about 300 per edit); live count tracks rock count, no duplicate hooks | none seen |
| b2 | new field on rock | `GameRock:resetup` | same | as b1 | same | as b1 | none seen |
| b3 | spawn rate in the world component | `GameWorld:resetup` | same | all rocks re-created (2 nodes survive) | world instance **new**; service same | re-registered | none seen |
| b4 | method body on ship | `GameShip:resetup` (a method on a class with `#private` fields) | same | rocks untouched, ship rebuilt | same | re-registered | none seen |
| c1 | `<gable-canvas>` class (background) | `GableCanvas:resetup` | **new**: canvas element, GL context and Application recreated every edit (created/destroyed 6/5 after 5 edits, 1 live); the old Application is destroyed | everything rebuilt (0 nodes survive) | world new; service same | re-registered | none seen |
| c2 | `<gable-canvas>` template | `GableCanvas:view` | same | only the 2 stage nodes owned by the canvas survive; the slotted game world is rebuilt | world new (rebuilt) | re-registered | none seen |
| d1 | service method body (`GameState.spawn`) | `GameState:patch` | same | everything survives (191 of 375 stage nodes were marked before the edit and still present; the rest are rocks that spawned or despawned in the 2 s window) | same | no change | none seen |
| d2 | new field on `GameState` | `GameState:resetup` | **new**: Application and GL context recreated every edit (6 created, 5 destroyed after 5 edits) | everything rebuilt | service and world new | re-registered | none seen |

What survives, by state kind:
- **Service state** (`elapsed`, `nextId`, `hits`, the `rocks` list): carried by `transferState` across every `resetup`, including d2 where the service instance itself is replaced. `elapsed` kept accumulating (for example d2: 1.71 s to 3.2 s to 4.69 s across consecutive edits) rather than resetting, and rock counts stayed continuous. The service is provided as a class (`GameState`) rather than `useValue`; a `useValue` service would not be hot-swappable (Gable's rule, not tested here).
- **Component fields** (`spawned` on the world): continuous across b3, c1 and d2 (101 to 193 to ... never back to 0). `spawnTimer` is a cyclic value in the range 0 to 1/60, so its before/after readings do not show whether it was transferred (**inconclusive**).
- **`#private` fields**: not transferred by `transferState`; the canvas host keeps its Application in `#app`, and a class edit to the host therefore cannot carry it, which is why c1 recreates the GL context. The same rule is why b4 (a plain method edit) was classified `resetup` and not `patch` once the class had `#private` members, while d1 on a service with no private fields was a clean `patch`.
- **Timers**: the demo has no real `setInterval`; the spawn accumulator (`spawnTimer`) is a world field and the elapsed clock (`elapsed`) a service field, both advanced by frame hooks. `elapsed` is continuous across all edits; `spawnTimer` is inconclusive (above). A real `setInterval` in a component field versus a service was **not tested**.
- **Frame-hook re-registration**: hooks were not duplicated in any edit. The live hook count follows the number of rocks plus the fixed ones (for example b1: 103, 188, 229, 246, 243, 238), the registered-ever counter grows by roughly one batch of rock hooks per resetup, and the loop's tick rate measured 59.3 to 60.4 ticks per second after every edit in the second run (no double loop, including after the Application was recreated in c1 and d2).
- **Textures and display objects**: Pixi `managedTextures` stayed at 5 (4 after an Application was recreated: the old textures are destroyed with it, the new Application has one fewer lazily created); no sprite held a destroyed texture and no destroyed object stayed attached to the stage in any snapshot (`results/hmr-ticks.json`: `spritesWithDestroyedTexture` 0, `destroyedStillAttached` 0 in all 12 snapshots). Only one `<canvas>` element and one live Application existed after every edit.
- **JS heap**: `usedJSHeapSize` moved between about 24 and 56 MB with no monotonic growth over 5 edits (b3 reached 55.5 MB, a1 stayed under 36 MB). 5 edits and no forced GC is too short to rule out a slow leak; **long-run leak behaviour is unmeasured**.
- **Latency**: Vite update to `afterUpdate` took 10 to 38 ms per edit (median about 24 ms).

## Surprises and caveats

1. The Application boundary is the HMR fault line. Any `resetup` of the host (c1) or of a provider above it (d2: adding a field to the service) recreates the canvas element and the WebGL context, because the host's own state lives in `#private` fields that Gable's state transfer cannot see. Everything else is cheap. A real implementation would want either a boundary-owned, transferable handle to the Application, or an explicit hot-data hook so the Application survives a host class edit.
2. Adding a field to a root-level service cascades to a full scene rebuild (d2), which is a much bigger reload than the edit suggests. Method-only service edits patch in place (d1).
3. Any rock class edit (b1, b2) rebuilds all live rocks (hot-swap is per instance and rocks are many); this was invisible in the demo but resets per-entity local state that is not transferred.
4. The `signals` style is dominated by signal-polyfill bookkeeping, not by Pixi. Pixi's render submit was never above 4 ms at 10,000 sprites.
5. `gl.finish()` is not a usable GPU-time probe under ANGLE.

## Unmeasured

GPU execution time per frame; Linux, macOS, integrated or mobile GPUs; refresh rates above 60 Hz; memory and GC pressure over long runs; WebGPU backend; real game logic costs beyond the synthetic hooks; text, filters, masks and mixed-texture batching; frame cost when the DOM HUD updates at high rate; HMR with `useValue` services; `applyUpdate` invoked directly.
