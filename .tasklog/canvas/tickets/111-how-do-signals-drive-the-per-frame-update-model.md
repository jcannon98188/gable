---
kind: ticket
title: "How do signals drive the per-frame update model?"
status: resolved
type: grilling
blocked_by: [107, 108]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.6 - How-do-signals-drive-the-per-frame-update-model.md
assignee:
  - '@jason'
ordinal: 229000
---

## Question

Decide how signal writes reach the scene and how time is modelled: retained-mode property writes batched once per frame (when the library re-renders versus when Gable flushes), who owns the ticker (library or Gable), the per-frame update hook and delta time, fixed-timestep simulation versus variable, whether high-rate state (positions at 60Hz) should be plain signals or a cheaper channel, and what the cost model is. Uses the renderer-seam research and the authoring prototype.

## Answer

Update model: Gable owns one frame loop per canvas boundary; signals stay the channel for high-rate state. Recorded in ADR 0020 (docs/adr/0020-gable-owns-the-canvas-frame-loop-and-renders-after-an-effect-flush.md); glossary terms "Frame loop" and "Frame hook". Measurements: branch `research/frame-cost-model` (docs/research/frame-cost-model.md).

1. **Loop ownership:** each canvas boundary runs one `requestAnimationFrame` loop owned by Gable. Pixi's own ticker is off and the library renders only when Gable says so. The loop pauses when the tab is hidden or the host is detached.
2. **Frame order:** (1) frame hooks run with `dt` and write signals; (2) a synchronous flush of Gable effects applies the writes to Pixi nodes; (3) one render. Render never happens inside the microtask flush. Input events between frames only mark the scene dirty and the next frame picks them up. Core exports a public synchronous flush (today `flushSync`, internal only).
3. **Render mode:** render every frame by default; opt-in `renderMode="on-demand"` on the host renders only when a hook or an effect wrote to the scene.
4. **Time:** hooks receive variable `dt` in seconds, clamped (about 50 ms). An opt-in fixed step, `onFixedStep(hz, cb)`, runs 0..n deterministic steps per frame from an accumulator and passes an interpolation alpha. Physics stays out of scope.
5. **`Frame` service:** public, in the canvas package (not core), provided at the boundary: `inject(Frame).onFrame(dt => ...)`. Hooks unsubscribe with the component's scope.
6. **Core changes accepted (four in total across canvas/110 and this ticket):** the renderer boundary, `Renderer.destroy?()`, a public synchronous flush, and a public scope-cleanup hook (core has no public DestroyRef/onDestroy today; the prototype used `@gable/core/internal`). All additive.
7. **High-rate state:** positions and rotations stay plain signals bound in templates; no cheaper reactive channel. Cost model to document: Gable overhead is about the number of bindings re-run per frame times ~0.65 microseconds, excluding Pixi's own cost. Measured in Node with the test renderer: 1,000 entities x 3 bound properties = 1.9 ms median per frame (0.8 ms with one signal and one binding per entity); 5,000 entities = 23 ms (8.5 ms). The cost tracks bindings re-run, not signal writes (one signal read by three bindings was as slow as three signals). p95 crosses a 16.7 ms frame between 3,000 and 4,000 entities with three bound properties each. Past roughly 3,000 entities use the direct-ref fast path (canvas/108) or a Pixi ParticleContainer. The measurement did not include a browser or Pixi.
8. **Engine optimisation:** no signal-engine change is decided now, because the numbers show no problem yet. When a real browser and Pixi prototype is profiled (performance-budgets fog), an optimisation in core is accepted in principle if effect scheduling is a hot spot (a cheaper binding path for renderer property writes, cheaper flush ordering). It must be behaviour-preserving, pass the existing core tests unchanged, and come with benchmarks. Reducing the binding count through the template vocabulary (composite properties like `[position]="p()"`) belongs to the scene tags ticket.

Flush facts for later tickets: effects flush in a microtask; a write inside a rAF callback flushes when the callback returns, before paint (from the HTML spec, not run in a browser); `flushSync`, `whenFlushed` and `hasPendingFlush` are exported only from `@gable/core/internal`; `runAfterFlush` is not exported from either entry point.

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T17:10:00Z

---
