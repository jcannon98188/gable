---
kind: ticket
title: "How do scenes get tested without a GPU?"
status: resolved
type: grilling
blocked_by: [110]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.10 - How-do-scenes-get-tested-without-a-GPU.md
assignee:
  - '@jason'
ordinal: 233000
---

## Question

The spike found Pixi trees build in Node but `Text` measurement needs a DOM and rendering needs WebGL. Decide the test story: a Gable test renderer for scenes (an in-memory node tree with the same tags and property semantics, per the glossary's Test renderer), how tests assert on positions/visibility/draw order and simulate pointer events and frames, whether browser-based golden-image tests exist at all and where they run, and how the test renderer stays honest against the real Pixi mapping.

## Answer

Testing: scenes are unit-tested in Node against a Pixi-shaped Test renderer with deterministic frames, simulated input and a test `Assets` double; a small opt-in real-browser smoke suite covers wiring; golden images are deferred.

1. **Scene test renderer:** `createSceneTestRenderer()` in the canvas package's testing entry point is an in-memory tree with the real scene tags and Pixi property semantics (dotted axis paths, `zIndex` sorting, number-or-`{x,y}` point-like props, graphics shapes recorded as data, static attributes converted by the same property table). It uses no Pixi and no WebGL.
2. **Honesty against Pixi:** (a) it runs `defineRendererConformance`; (b) one shared tag and property table feeds the test renderer, the real Pixi renderer and the language-service element map (canvas/112), so they cannot drift; (c) a parity suite builds the same templates with the real Pixi renderer in Node (excluding `Text` and rendering) and compares properties and child order with the test renderer.
3. **Assertions:** tests read plain data, for example `fixture.scene.find("sprite#ship")` giving `x`, `y`, `rotation`, `visible`, `alpha`, `texture`, `children`. Draw order is child order with `zIndex` applied; world position is computed from the parent chain. No pixel assertions; no text measurement or texture sizes in the double. Bounds are an explicit helper using author-supplied sizes.
4. **Simulated input:** `scene.pointer.down/move/up/tap(x, y)` hit-test against `[hitArea]` or declared size and fire the template event path with a Pixi-event-shaped `$event`; `scene.keyboard.press/release(code)` and `scene.gamepad.connect/setAxis/setButton` drive test doubles of the `Keyboard`, `Pointer` and `Gamepad` services, which record per-frame snapshots.
5. **Frames and time:** the test renderer owns no rAF. `fixture.frame(dtMs = 16)` and `fixture.frames(n, dtMs)` run one deterministic Frame loop step in ADR 0020's order (hooks, synchronous flush, recorded render). `onFixedStep` advances by accumulated `dt`, so 100 ms yields six 60 Hz steps.
6. **Assets double:** `provideTestAssets()` replaces the `Assets` service. Bundles are instantly `ready` by default with stub textures (settable `width`/`height`); `fixture.assets.bundle("level1").setStatus("loading", 0.4)` and `.fail(error)` script states. Tests can assert `@if (level.ready())` switching and that scope disposal releases a bundle.
7. **Browser tests:** no golden-image tests in v1. One opt-in smoke suite in real Chromium with WebGL, run in CI only when the canvas package changes, mounts a scene through the real renderer and asserts it renders non-blank and that pointer events reach nodes (host lifecycle and DOM/scene event path). Golden images wait until a real game needs them.
8. **DOM plus scene in one fixture:** a `<gable-canvas>` host with a DOM HUD is tested in one `mountApp` fixture exposing `fixture.scene` beside `fixture.root`, joined by DI-shared signals; clicking a HUD button and asserting on a scene node works. The test renderer implements `destroy?()` and boundary layering (ADR 0019).

Facts relied on: the existing Test renderer in `packages/testing` builds an inspectable `TestNode` tree and `defineRendererConformance` checks any renderer against the Renderer contract; Pixi trees build in Node but `Text` needs a DOM and rendering needs WebGL (canvas/109 spike).

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T17:48:00Z

---
