# Canvas benchmark

Frame cost of the Gable canvas binding (`@gable/renderer-pixi`), per phase, for the ways an entity can be updated, at several entity counts. It is the permanent form of the Pixi spike's benchmark (TASK-104.14).

## What it measures

Every entity is a component with its own `inject(Frame).onFrame(...)` hook that moves one sprite each frame, so the numbers are the cost of "entities are components". Update styles:

| style | what an entity does |
| --- | --- |
| `signals` | three signals (x, y, rotation), three bindings |
| `shared` | one signal holding a pose object, three bindings reading it |
| `ref` | writes straight to the Pixi node through `#ref`: no signals, no bindings |
| `particles` | one hook moves a Pixi `ParticleContainer`: the ceiling, not the design |

Per frame, measured from outside the renderer (`src/measure.ts`):

- **hooks**: `Frame.advance`, the entity hooks
- **flush**: from the end of the hooks to the start of render: `flushSync` writing signal changes to Pixi nodes, plus the renderer's per-frame redraw
- **render**: `Application.render`, Pixi's submit
- **jsTotal**: the three added together
- **frame**: time between animation frames (percentiles p50, p95, p99, and the count of dropped frames); only meaningful in a browser with a real `requestAnimationFrame`

## Run it

```sh
npm ci                                   # at the repo root
npm ci --prefix examples/canvas-benchmark
npx playwright install chromium          # or set GABLE_BROWSER to a Chrome, Edge or Chromium binary

npm run bench:canvas:micro               # Node microbench: no browser, no GPU (also runs on every PR)
cd examples/canvas-benchmark
npm run bench                            # headless Chromium, software GL; writes results/swiftshader.json
npm run bench -- --counts 500,1000 --styles signals,ref --reps 1 --frames 120   # a quick run
```

`scripts/run.mjs` builds the page with Vite (packages resolve from source, no prior build), serves it, loads one configuration per page and writes raw results JSON. `--help`-style options are listed at the top of the script.

## Profile the flush

```sh
cd examples/canvas-benchmark
node scripts/profile.mjs --style signals --n 5000      # writes results/profile-signals-5000.cpuprofile
```

`scripts/profile.mjs` records a CPU profile of one configuration and prints self time per function over the samples taken inside the frame's `flushSync`. It builds the page unminified so the names are real, so use it for attribution and `npm run bench` for the numbers. `docs/research/frame-flush-optimisation.md` records what the profiles showed.

## CI regression gate

- **Every PR** runs the Node microbench (`npm run bench:canvas:micro`, in the `build-test` job) and the unit tests of the gate itself.
- **Every PR** also runs the `canvas-benchmark` job: it builds the same page against the base commit's packages (`--src`) and against the PR's, measures both in headless Chromium **on the same runner**, and `scripts/compare.mjs` fails the job when any JS-side phase (hooks, flush, render or their total) is more than **15 percent** worse than the baseline. The compared value is the median over repetitions of each run's p50; a change under 0.1 ms is treated as noise (`--threshold`, `--floor-ms`).
- **Absolute budgets are never gated on CI hardware.** Software GL on a shared runner ran the JS phases 1.5 to 2 times slower than a real machine in the spike, so only relative change against a baseline from the same runner means anything. The published budgets (entities per style at 60 and 120 Hz) are a documentation matter, checked on the reference machine.

## Real GPU: the results file

Before each release, on the reference machine (a real GPU, not software GL):

```sh
cd examples/canvas-benchmark
npm run bench:gpu -- --reps 3 --frames 600 --warm 120 --counts 500,1000,2000,5000,10000 --styles signals,shared,ref,particles
```

This writes `results/real-gpu.json` (the one results file that is committed; everything else under `results/` is ignored). It records the machine (OS, CPU, the WebGL renderer string the browser reported, the browser) next to the raw per-run numbers. Check `meta.glRenderer`: a name containing `SwiftShader` means the browser fell back to software GL and the run is not a real-GPU result.
