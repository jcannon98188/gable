# Canvas authoring prototype (TASK-104.3), throwaway

Question: what should a declarative Gable game look like to author on a Pixi-backed `Renderer`?

Same game ("Dodge": ship follows the pointer, rocks fall, hit = run over, score = survival time, DOM HUD with score/best/Restart) written three structurally different ways. Rough and ugly on purpose; no tests.

## Run

```
npm install                                   # once at the repo root (picks up the new workspace; this prototype adds "prototypes/*" to root workspaces, lockfile NOT regenerated)
npm run build                                 # once, if packages/*/dist is missing
npm run dev -w prototypes/canvas-authoring     # http://localhost:5199/?variant=a|b|c
```

Switch variants with the bottom bar (full reload) or `?variant=a|b|c`. Screenshots: `screenshot-{a,b,c}.png` (mid-run) and `screenshot-*-over.png` (game over), taken with headless Chromium + SwiftShader.

Verified in headless Chromium: all three render ship + falling rocks, the DOM HUD score ticks up, a collision ends the run (phase "over", best updates, "GAME OVER" text appears from an `@if`), Restart starts a new run. Not verified: real GPU, touch, resizing, HMR, Vite production build, `tsc` (never run on this dir).

## Files

- `src/pixi-renderer.ts`: the Renderer (container/sprite/graphics/text, props straight onto Pixi, `addChildAt` insert, `eventMode` + `.on` listen).
- `src/pixi-stage.ts`: `<pixi-stage [scene]>` host, creates the `Application` (autoStart off), mounts the scene through the Pixi renderer, drives the loop.
- `src/game-state.ts`: shared `GameState` (phase, elapsed, best, run, computed `score`/`alive`) and the `Frame` service (`onFrame(cb)`).
- `src/main.ts`: DOM app (HUD, stage, switcher bar).
- `src/variant-a.ts`, `variant-b.ts`, `variant-c.ts`: the three styles, thesis and trade-off in each header comment.

## The three theses

- **A, signals everywhere.** Every moving property is a signal binding in the template; rocks are an array signal under `@for`, each rock holds `y`/`rot` signals; one frame hook only writes signals; `hit` and tints are `computed`.
- **B, template for structure, refs for the hot path.** Template declares the tree and coarse bindings; positions are written straight onto Pixi nodes obtained via `#ship` / `#rock` (`viewChild`/`viewChildren`) in the frame hook. Only membership and game phase are signals.
- **C, components per entity + services.** `<game-ship>`, `<game-rock>`, `<game-spawner>` are components with local signals and their own frame hooks; `@for` over a `World` service list creates and destroys rocks. (Besides the shared `GameState`, C needs a `World` service for pointer, ship position and the rock list.)

## Core hacks (all marked `// HACK(core gap):` in the code)

1. No per-subtree renderer: the Pixi scene can only be mounted imperatively with `createComponent({ renderer, host: app.stage })` from a DOM component's setup.
2. `createComponent` has no parent scope, so the scene's lifetime is wired by hand (`scope.onDispose(ref.destroy)`).
3. `createComponent` does not install `RENDERER` or `renderer.providers`; the child injector is built by hand with `createInjector([...], inject(INJECTOR))` to share `GameState`/`Frame`.
4. No public destroy hook: `currentScope().onDispose` from `@gable/core/internal` (used in `Frame.onFrame` and the stage).
5. Effects flush in a microtask and there is no frame/after-flush seam: the loop calls `flushSync()` (internal) before `app.render()`.
6. `Renderer` has `remove()` but no `destroy()`: the Pixi renderer destroys on remove, assuming removal is permanent.
7. Uses `@gable/core/internal` (`injectHost`, `INJECTOR`, `flushSync`, `currentScope`) in three places.

## What felt good / awkward

General
- The renderer was small (~100 lines) and the core did not care that nodes are Pixi objects. Unknown tags (every component selector like `game-rock`) becoming a `Container` host just worked, as did `@if`/`@for` and component composition in a canvas.
- Static attributes become properties by my own `coerce` (`anchor="0.5"` becomes a number): handy, but it is a renderer convention the language service knows nothing about. Nothing type-checks `[tint]`, `[rectW]` etc.; a typo is a silent property assignment onto the Pixi object.
- No object or array literals in template expressions, so no `[anchor]="{x:.5,y:.5}"`, no `[position]`; I invented flat scalar props (`rectW`, `rectH`, `circle`, `shape`) for graphics/sprite. Pixi `Graphics` is imperative (clear/draw/fill), so each geometry prop change redraws; a real design needs a declarative shape model.
- Text nodes (`{{ }}`) do nothing useful on canvas; I used `[text]`/`text="..."` attributes. A `<text>` tag with interpolation children would need the renderer to own text children.
- Pointer events: events only reach nodes with an `eventMode`, so `listen` sets `static`; a full-screen invisible `graphics` rect as pointer catcher is how I got scene-wide `pointermove` (`(pointermove)="move($event)"`). `$event` is a Pixi `FederatedPointerEvent` with no typing.
- Hit testing, collision and "what is the ship near" are not renderer matters at all; they landed in class code in every variant.
- Template expression rules barely bit in the scene templates (only property reads and literals were needed) because every derivation had somewhere to go: `computed` (A, C) or class code (B). Where they did bite: a tint depending on `alive` needs a `shipTint` computed (A, B, C); `hit` and rock `scale` (`data().r / 20`) are computeds or precomputed fields; an `(pointermove)` handler needed a method rather than inline code. Fine and arguably good, but it is more named fields per visual tweak.
- Scene fields initialised from `this.frame.onFrame(...)` look odd (`hook = ...`): the setup-time hook registration has no natural home in a no-constructor class (no `onInit`).

A, signals everywhere
- Felt the most "Gable": the template reads as a description of the picture, derived state is trivially correct, and the hit test is a `computed`.
- Verbose: three bindings per rock (`[x] [y] [rotation] [scale]`) plus per-rock signals just to move something; every property is its own effect re-running per frame (3N effects for N rocks), so signal churn per frame is the dominant cost and would not scale to hundreds of sprites.
- Immutable-list updates (`rocks.update(l => [...l, rock])`) for spawn and filter for despawn feel heavy for a game.
- The frame hook still has to be imperative: a loop writing signals. Declarative only below the hook.

B, template + refs
- Pleasantly fast and closest to ordinary Pixi code; the frame hook is short and obvious. Coarse signals (`shipTint`, `alive`, score) reactively drive the template and DOM HUD with no extra work.
- Two sources of truth: rock data in a plain map and Pixi node properties. Needed `[label]="r.id"` on every rock node so `viewChildren("rock")` nodes can be mapped back to data (the query returns nodes, not entities; order is not a reliable key). Staleness is real: nodes lag data by one flush (a spawned rock has no node in the frame it was added; a despawned node can linger), so the hook has `if (!rock) continue`.
- `viewChild` returns the raw Pixi node typed by me (`viewChild<Container>("ship")`); `#ref` inside `@for` works for `viewChildren` but I did not check document-order guarantees (my renderer has no `compare`).
- The template shows initial positions only (`[y]="r.y"` is read once, since `r` is a plain object); that is invisible to a reader and a trap.

C, components + service
- Best structure to scale and test: `Rock` is one tiny file with its own motion and collision, `@for` creates and destroys it, per-entity DI works. Closest to how I would expect a game with many entity types to be written.
- Most ceremony: five classes, and the composition required a `World` service on top of `GameState`; entities coordinate through shared mutable signals (pointer, ship position) and polling it each frame.
- A real bug I hit: on Restart, `world.clear()` is requested from the spawner's frame hook but removal only lands after this frame's hooks, so old rocks near the ship killed the new run instantly. Fixed with a per-rock run id check. Order-of-hooks and deferred removal are a hazard class that signals-everywhere (A) avoids and B avoids by being synchronous.
- One frame-hook subscription per entity; fine for dozens, questionable for hundreds. Every component adds a host `Container` to the scene graph, so deep scenes pay extra nodes.
- `input.required<RockData>()` with `[data]="r"` and `data().x` in the template worked fine.

My take: C for structure, with an escape hatch to B-style node refs for particle-like entities (hundreds of homogeneous sprites). A is the cleanest to read but its per-property signal cost makes it a poor default for hot paths. The three really want a frame-scheduling seam in core (a `Frame`/`FrameScheduler`-style service whose flush ordering with effects is defined) and a per-subtree renderer so scenes can be written inside a DOM template (`<pixi-stage>` without imperative mounting).
