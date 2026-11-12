# Gable owns the canvas frame loop and renders after an effect flush

Each canvas renderer boundary runs one `requestAnimationFrame` loop owned by Gable, with the graphics library's own ticker turned off. A frame runs frame hooks with a clamped variable `dt` (which write signals), then flushes Gable's effects synchronously so the writes land on the library's nodes, then renders once. Rendering never happens inside the microtask effect flush, and writes made between frames only mark the scene dirty. Core exports a synchronous flush for this; the frame loop and the `Frame` service live in the canvas package, not core.

High-rate state (positions at 60Hz) stays in ordinary signals bound in templates. There is no second, cheaper reactive channel: the direct-ref fast path covers the heavy cases (thousands of homogeneous entities), and measurement shows the cost is the number of bindings re-run per frame, roughly 0.65 microseconds each in Gable's own overhead.

## Alternatives rejected

Letting the library own the ticker (Pixi's default) and subscribing to it. It splits ordering between two schedulers, so effects could flush after the render that should have included them, and pause and teardown would be the library's to manage.

Rendering from `runAfterFlush` or at the end of each microtask flush. It would render on every incidental signal write and give no defined place for per-frame hooks.

A dedicated cheap channel (typed arrays or a transform buffer) for high-rate state. It adds a second source of truth next to signals for a cost the numbers do not show to be a problem, and refs already provide an escape hatch.

## Consequences

The frame order is fixed and testable: hooks, effect flush, render. An opt-in on-demand render mode skips frames with no writes. An opt-in fixed step runs deterministic simulation steps from an accumulator for games that need them; physics itself is not part of this decision.

Gable's signal engine is not changed by this decision. If a browser profile with a real renderer shows effect scheduling is a hot spot, a behaviour-preserving optimisation in core is accepted in principle, guarded by the existing core tests and new benchmarks.
