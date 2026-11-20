---
kind: ticket
title: ">-\n  What are the canvas package layout, entry points and public API surface, and\n  what ships in v1?"
status: resolved
type: grilling
blocked_by: [115, 116]
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.12 - What-are-the-canvas-package-layout-entry-points-and-public-API-surface-and-what-ships-in-v1.md
assignee:
  - '@jason'
ordinal: 235000
---

## Question

With hosting (canvas/110), update model (canvas/111), tags (canvas/112), input (canvas/113), assets (canvas/114), testing (canvas/115) and accessibility (canvas/116) decided, decide the package layout, naming and public API surface of the canvas binding: the package name and where it lives in the monorepo; its entry points (renderer and `<gable-canvas>` host, services `Frame`, `Pointer`, `Keyboard`, `Gamepad`, `Assets`, `ReducedMotion`, testing, language-service element map); how Pixi is a dependency (peer, direct, version range, tree-shaking and lazy loading of the renderer so non-game pages do not pay for it); what the four additive core changes are exported as and from which entry points; how the Vite and language-service packages learn about the boundary; the list of public names and the naming convention; and what ships in v1 versus later (ordered build tickets and their dependencies, as the hand-off the map exists to produce).

## Answer

Package layout and API: one new package, `@gable/renderer-pixi`, with three entry points, Pixi as a lazily loaded peer dependency, four additive core exports, and an ordered build plan in which everything decided so far ships before the first release.

1. **Package:** `@gable/renderer-pixi` at `packages/renderer-pixi`, following `renderer-dom`. It holds the Pixi renderer, the `<gable-canvas>` host (tag `gable-canvas`) and the services `Frame`, `Pointer`, `Keyboard`, `Gamepad`, `Assets`, `ReducedMotion`. Lockstep release with the other Gable packages.
2. **Entry points:** `@gable/renderer-pixi` (renderer, host, services, `provideAssets`); `@gable/renderer-pixi/testing` (scene test renderer, `provideTestAssets`, input and frame doubles; kept here so `@gable/testing` never depends on Pixi); `@gable/renderer-pixi/elements` (element map types and the shared tag/property table, importable by tooling without loading Pixi).
3. **Pixi dependency:** `pixi.js` is a peer dependency (`^8`), so apps share one copy with direct Pixi use (`Texture`, `Filter`, hit shapes). `<gable-canvas>` loads the renderer and Pixi through a dynamic `import()` on first mount, so routes without a game do not pay for it; the host shows fallback content while loading.
4. **Core changes (all additive, existing behaviour and tests unchanged):** the renderer boundary (`meta` key `renderer`) and `Renderer.destroy?()` in `@gable/core/renderer`; the synchronous flush pair (`flushSync`, `whenFlushed`) public, in the main entry point if safe, otherwise a new small `@gable/core/frame` entry point, never `/internal`; the scope-cleanup hook `onCleanup` in `@gable/core`.
5. **Tooling:** the language service and Vite plugin read only `@gable/renderer-pixi/elements`. A component's `meta.renderer` pointing at the Pixi renderer (statically resolvable) selects the Pixi element map for its template; scene components carry the canvas/112 marker. No Vite change for the first build (assets use ordinary imports per canvas/114).
6. **Naming:** services are PascalCase nouns (`Frame`, `Pointer`, `Keyboard`, `Gamepad`, `Assets`, `ReducedMotion`); providers `provideX` (`provideAssets`, `providePixiRenderer`); renderer factory `pixiRenderer(options)` for `meta.renderer`; test helpers `createSceneTestRenderer` and `provideTestAssets`; helper functions are verbs (`announceOnChange`).
7. **Scope and build order: nothing is released half-done.** The human's ruling: the items earlier tickets deferred are not post-release; they are later in the build order and must be finished before the package is ever released. Release gate = everything below.
   - **Phase A, core path, in dependency order:** (1) core additive changes; (2) package skeleton plus the shared tag/property table; (3) renderer and host; (4) frame loop and `Frame`; (5) `Pointer`/`Keyboard`/`Gamepad`; (6) `Assets`; (7) element map and enforced typing in the language service; (8) testing entry point and parity suite; (9) `[a11y]` mirror; (10) real-browser smoke suite.
   - **Phase B, deferred items now release-blocking:** declarative `hit-*` child tags; drag and long-press helpers; the Vite plugin that rewrites sibling asset paths; golden-image tests (decided in canvas/115 as "when a real game needs them", now required before release); a lint that flags pointer-listening nodes without `[a11y]`.
   - **Still in the fog and also release-blocking:** HMR for game state across edits, and performance budgets and devtools (need a real browser and Pixi profile). They are charted as tickets when a running Phase A prototype exists.

---
<!-- COMMENTS:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T18:32:00Z

---
