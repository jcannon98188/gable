# Core surface added for renderer boundaries, hot data and the canvas frame loop

ADR 0019 let a component build its template with another renderer, and ADR 0020 put the canvas frame loop in Gable. Building the canvas binding added a small public surface to `@gable/core`. This records it.

## Decisions

- `Renderer.knowsElement(tag)`: a renderer says whether it owns a tag. The compiler and the language service use it to tell a scene tag from a component or a DOM tag without trying to create one.
- `Renderer.warnRawTimers`: a renderer that runs its own frame loop asks core to warn, in development only, once per timer, when a raw `setTimeout`, `setInterval` or `requestAnimationFrame` is used inside its boundary. Such timers run outside the frame order of ADR 0020.
- `Renderer.destroy()`: called when the boundary's scope is disposed, so the canvas package can release its application.
- `onCleanup(fn)`: registers a teardown on the current scope. Used by services that a component injects and that must stop with it.
- `hotData`, `isHotUpdating()`: a component keeps named state across a hot update. `isHotUpdating()` lets setup code skip work that a replaced instance already did. A throwing setup during a hot update rolls back and keeps the old state.
- The boundary registry: each renderer boundary is registered per instance, so devtools can show the tree of boundaries and tests can find them. Boundary creation that throws disposes the component's scope.
- `flushSync()` returns the number of effects it ran. The frame loop uses it to skip rendering when nothing changed in on-demand mode, and tests use it to assert a write caused no work.
- `whenFlushed()` resolves after the next effect flush.

## Core optimisations made with it

Benchmarks of the canvas binding (ticket 105.17) led to behaviour-preserving changes in signals, expression evaluation, views and scopes, and an inlined guard in the hot update path. The existing core tests guard them, and a development-only guard keeps cleanup counting out of production bundles.

Measured in the browser benchmark at 5,000 entities, alternating base and fix runs, median of six: effect flush fell 26 to 29 percent and total JavaScript per frame fell 17 to 19 percent. The render phase rose (signals 1.3 to 1.7 ms, shared style 1.2 to 2.2 ms). The cause is that the per-frame transform writes are now named stores, which move work from the flush into the render phase. It is a shift between phases, not a net regression, and no change was made for it. The shared-style hooks timing moved more than this explains and is not understood.

## Consequences

Every field above is optional on the renderer contract, so the DOM renderer is unchanged. The additions are minor-version changes under the lockstep release.
