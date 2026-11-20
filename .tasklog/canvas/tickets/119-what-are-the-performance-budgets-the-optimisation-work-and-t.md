---
kind: ticket
title: ">-\n  What are the performance budgets, the optimisation work and the devtools\n  support for canvas scenes?"
status: resolved
type: grilling
blocked_by: [117]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.14 - What-are-the-performance-budgets-the-optimisation-work-and-the-devtools-support-for-canvas-scenes.md
assignee:
  - '@jason'
ordinal: 237000
---

## Question

Decide the performance budgets, the optimisation work, and the devtools support, using the real-browser measurements on branch `prototype/pixi-renderer-spike` (`docs/research/pixi-renderer-spike.md`; i9-9900KF, RTX 2060 SUPER, Chromium via ANGLE D3D11, production build, 600 frames, median of 3 reps).

Measured (JS phases combined, 60 Hz capped): at 5,000 entities, 3 signals per entity costs 18.4 ms (over the 16.7 ms budget, 76 of 600 frames dropped); 1 signal with 1 binding 7.9 ms; direct `#ref` writes 3.3 ms. At 10,000: 41.9 ms, 16.9 ms (21 dropped), 6.1 ms. A `ParticleContainer` with 100,000 particles cost 3.9 ms. The effect flush dominates (about 2.2 microseconds per entity in the 3-signal style); Pixi's render submit stays under 4 ms even at 10,000. The CPU profile at 5,000 entities puts about 36% of sampled time inside signal-polyfill internals, `producerNotifyConsumers` hottest at 15%. Uncapped, frame time tracks JS time, so the GPU was not the limit. GPU execution time is unmeasured (`gl.finish()` returned about 0 ms under ANGLE). Software GL ran the JS phases about 1.5 to 2 times slower.

Decide: (1) the budgets to publish and test against: entity counts per update style at 60 Hz and 120 Hz, the reference hardware, and what happens on weaker devices (measure on a low-end laptop and a phone, or state the scaling rule); (2) whether the engine or signal layer gets optimisation work, given ADR 0020's rule (behaviour-preserving, existing tests unchanged, only after a profile) and the profile above, and which targets (notification fan-out in the polyfill, batching writes to one binding, coalescing per-entity bindings); (3) whether the renderer offers a first-class high-count path (refs, batched property writes, `ParticleContainer`) beyond what canvas/108 sanctioned, and where the documentation draws the line; (4) the devtools support: a frame-time and per-phase overlay, entity and binding counts, a way to see which bindings re-ran in a frame, and what the Designer and the browser devtools extension show for a boundary; (5) a benchmark suite kept in the repo and run in CI with a regression gate, and what is measured on a real GPU versus software GL; (6) the unmeasured items: GPU time, other OSes and GPUs, WebGPU, long-run GC pressure.

## Answer

Performance: published cost-based budgets, a gated optimisation plan aimed at the flush, a first-class particle tier, dev-only overlay and devtools panels, a relative-regression CI benchmark, and every unmeasured item turned into measured release-gate work.

1. **Budgets:** published as costs so authors can compute their own scenes, from the reference machine (i9-9900KF, RTX 2060 SUPER, Chromium via ANGLE D3D11): about 0.75 microseconds per binding write, about 0.8 microseconds per entity for the one-signal style, about 0.3 ms of Pixi render submit per 1,000 sprites. Measured ceilings at half a 16.7 ms frame (8 ms) for Gable plus Pixi: about 2,000 entities with three bindings each, about 5,000 with one binding, 10,000 or more with `#ref` writes. Before release the same suite is run on at least one low-end laptop and one phone-class device and those numbers are published beside them.
2. **Optimisation, in order, each gated by a fresh profile, behaviour-preserving, existing tests unchanged:** (1) find why `__privateIn` (9.8% of samples) appears and fix the build target if `#x in obj` is being lowered unnecessarily; (2) cut flush overhead in Gable's own code (`byDepthThenCreation` sort, `flushNow`, `evaluate`, binding apply path); (3) only if signal-polyfill notify and poll paths still dominate, improve them: upstream patch first, vendored patched copy as a last resort; (4) only then consider coalescing a node's bindings into one effect. Target: at least 30% less flush time at 5,000 entities in the three-signal style; a step is kept only if it measurably helps.
3. **High-count tiers:** a `particle-container` scene tag (Pixi `ParticleContainer`) whose particles are created and updated through a `#ref` helper, not child tags; the "pose" style (one signal per entity feeding point-like properties, for example `[position]="pose().pos"`) is a documented middle path with its measured cost and no new API; `#ref` direct writes stay the sanctioned fast path (canvas/108). Docs draw the line by measured counts and say to move down a tier when a scene exceeds half a frame.
4. **Devtools:** (a) a dev-only frame overlay, opt-in via a `debug` attribute on `<gable-canvas>` or `provideCanvasDebug()`: per-phase ms (hooks, flush, render), rolling p50 and p95, dropped frames, display-object count, bindings re-run in the last frame; (b) a Scene panel in the browser devtools extension showing the display-object tree with source locations and the last flush's effects, reusing the `@gable/core/devtools` flush records and why-reports; (c) the Designer's preview agent understands a renderer boundary and reports the scene tree like a DOM tree.
5. **Benchmarks and gates:** a permanent `examples/canvas-benchmark` productionises the spike's page and driver. Every PR runs a Node microbench (the frame-cost model, no browser). CI also runs the headless Chromium benchmark and gates on relative regression of JS-side phases against a baseline measured on the same runner (fail above 15% worse). Absolute budgets are never gated on CI hardware (software GL ran JS phases 1.5 to 2 times slower); real-GPU results on the reference machine are recorded in a results file before each release.
6. **Unmeasured items, each a measured release-gate result in `docs/research/`:** GPU execution time (timestamp queries or a Chrome trace; `gl.finish()` returned about 0 ms and told us nothing); Linux, macOS, integrated GPUs and a phone; 120 Hz displays; the WebGPU backend; long-run GC pressure (per-frame allocations, heap over a long session); text, filters, masks and mixed textures; high-rate DOM HUD updates beside the scene. Where no method exists yet (GPU timing), designing one is part of the work.

Facts relied on (spike, branch `prototype/pixi-renderer-spike`, `docs/research/pixi-renderer-spike.md`): at 5,000 entities three signals per entity cost 18.4 ms JS p50 (76 of 600 frames dropped), one signal with one binding 7.9 ms, `#ref` writes 3.3 ms; at 10,000, 41.9 / 16.9 / 6.1 ms; 100,000 particles 3.9 ms; flush dominates, Pixi render submit under 4 ms at 10,000; CPU profile at 5,000: signal-polyfill internals about 36% of samples, `producerNotifyConsumers` 15%, `__privateIn` 9.8%; uncapped frame time tracks JS time so the GPU was not the limit; the repo already has `@gable/core/devtools` (flush records, why-reports) and `examples/*-benchmark`.

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T21:44:00Z

---
