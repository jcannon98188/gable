---
kind: ticket
title: Gable Canvas design map
status: open
tags:
  - wayfinder-map
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104 - Gable-Canvas-design-map.md
ordinal: 223000
---

## Question

Imported from backlog.md without a description.

## Destination

A spec and a set of locked decisions, ready to turn into build tickets, for a declarative canvas/WebGL/WebGPU binding that lets signal-driven Gable apps make 2D graphical games on PixiJS 8. The effort ends when what to build is clear; prototypes are only artifacts to react to, not deliverables.

## Notes

- Prototype and measurements: branch `prototype/pixi-renderer-spike`, `docs/research/pixi-renderer-spike.md` (real Pixi, real Chromium and GPU, Vite HMR).
- Scope cut by the human: no hardware or OS measurement work (phones, low-end laptops, macOS, Linux, other GPUs, 120 Hz, WebGPU); budgets use the reference-machine numbers only. This overrides the matching lines in canvas/119.
- Release gate: anything a ticket "defers" or marks "later" is build order, not post-release. The package is not released until all of it, including the fog items, is built (canvas/117).
- Browser only. Gable Native (map native/99) is out of scope; keep the tag vocabulary free of DOM-isms so it could later map onto Native's renderer.
- The binding is a Gable `Renderer<N>` implementation: templates describe a scene (`<sprite [x]="x()">`), nodes are PixiJS 8 display objects, signal writes update only changed properties (retained mode). A thin DOM-hosted component (`<gable-canvas>`) lets a scene sit inside a normal DOM app for HUDs and menus.
- Bind to PixiJS 8 directly (no second abstraction layer beyond the Renderer contract). 2D only; 3D is dropped from this effort.
- Scope of "making games": scene binding, frame loop and timing, input events, asset loading, hit-testing, animation hooks. Physics, audio, ECS/entity frameworks, networking and tilemap editors are separate efforts.
- Gable rules apply: plain classes with `static meta`, static `html` templates with no `${}` holes, simple template expressions. Vocabulary: see GLOSSARY.md (Renderer, Platform services, Test renderer).
- Skills for sessions: grilling and domain-modeling for HITL tickets; research for research tickets.

## Decisions so far

<!-- the index: one line per closed ticket -->

- [What are the performance budgets, the optimisation work and the devtools support for canvas scenes? (canvas/119)](119-what-are-the-performance-budgets-the-optimisation-work-and-t.md): budgets published as per-binding costs plus measured ceilings (about 2,000 / 5,000 / 10,000+ entities by update style at half a frame) with low-end laptop and phone runs before release; gated optimisation order (build target for `__privateIn`, own flush code, polyfill, then binding coalescing; target 30% less flush at 5,000); `particle-container` tag and documented pose/ref tiers; dev overlay, devtools Scene panel and Designer boundary support; relative-regression CI benchmark; every unmeasured item a measured release-gate result.

- [How does game state survive hot edits, and how does the Pixi Application survive host and service edits? (canvas/118)](118-how-does-game-state-survive-hot-edits-and-how-does-the-pixi.md): a fifth additive core primitive, dev-only `hotData(key, create)`, holds the Application so host and provider edits never recreate the GL context; durable game state lives in services (timers via `Frame` hooks, accumulators in the `Frame` service, a dev warning for raw timers without `onCleanup`); entity class edits rebuild the swarm, accepted; release-gate soak and unit tests for the unmeasured gaps.

- [What are the canvas package layout, entry points and public API surface, and what ships in v1? (canvas/117)](117-what-are-the-canvas-package-layout-entry-points-and-public-a.md): one package `@gablejs/renderer-pixi` with entry points `.`, `/testing`, `/elements`; `pixi.js` ^8 as a lazily imported peer; four additive core exports (boundary and `destroy?()` in `/renderer`, public flush pair, `onCleanup`); tooling reads only `/elements`; naming conventions; ordered build plan in two phases where deferred items (hit tags, drag helpers, Vite plugin, golden images, a11y lint) and the fog items are release-blocking, not post-release.

- [How is canvas content made accessible and how does focus move between the DOM HUD and the scene? (canvas/116)](116-how-is-canvas-content-made-accessible-and-how-does-focus-mov.md): labelled DOM host (`role="group"`), opt-in `[a11y]` property on scene tags backed by a Gable-owned hidden DOM mirror (not Pixi's accessibility plugin); host or mirror elements are tab stops with no focus trap and a DOM focus ring; announcements reuse `LiveAnnouncer` with a throttled `announceOnChange` helper; `ReducedMotion` signal service; author checklist instead of an audit; tested via recorded mirror data plus an axe-core smoke check.

- [How do scenes get tested without a GPU? (canvas/115)](115-how-do-scenes-get-tested-without-a-gpu.md): scenes are tested in Node against a Pixi-shaped scene test renderer (shared tag/property table with the real renderer and the element map, conformance suite plus a Node parity suite against real Pixi); deterministic `fixture.frame(dt)`; simulated pointer, keyboard and gamepad via service doubles; `provideTestAssets()` with scriptable bundle states; one DOM+scene fixture; no golden images in v1, only an opt-in real-Chromium smoke suite in CI on canvas changes.

- [How do assets load and how do loading states show in templates? (canvas/114)](114-how-do-assets-load-and-how-do-loading-states-show-in-templat.md): strings in `[texture]` resolve synchronously from Pixi's cache and loading is explicit; an app-level `Assets` service with `provideAssets({ bundles })` returns bundle handles (`status`, `progress`, `error` signals; ref-counted `load()` tied to the caller's scope, `unload()`); loading UI uses `@if` and `@defer (when ...)` over those signals; spritesheets and fonts are plain bundle entries; Vite imports for single files, `public/` for multi-file families.
- [How do pointer, keyboard and gamepad input reach scene nodes? (canvas/113)](113-how-do-pointer-keyboard-and-gamepad-input-reach-scene-nodes.md): scene tags take Pixi's federated events 1:1 (auto `eventMode: static` when a listener is attached; `[hitArea]` for custom shapes); injected `Pointer`, `Keyboard` (focus-scoped, polled per frame) and `Gamepad` (polled per frame) services in the canvas package; DOM/scene separation through plain DOM rules (`pointer-events`, `touch-action`, focus); `$event` is Pixi's own event typed by the element map; action maps are out of scope.
- [Which scene tags exist and how do their properties map onto Pixi objects? (canvas/112)](112-which-scene-tags-exist-and-how-do-their-properties-map-onto.md): v1 tags are Pixi's names in kebab case (container, sprite, text, bitmap-text, graphics, tiling-sprite, nine-slice-sprite); properties are Pixi's own with dotted axis paths (`[scale.x]`, no core change); graphics shapes are child tags redrawn once per frame; extensible tag registry (unregistered hyphenated tag = component host, unhyphenated = dev error); masks via `[mask]` refs, filters via `[filters]`; static attributes converted by a property table; language service needs per-template element maps with enforced typing (it is DOM-only today).
- [How do signals drive the per-frame update model? (canvas/111)](111-how-do-signals-drive-the-per-frame-update-model.md): Gable owns one rAF loop per boundary (Pixi ticker off); frame order is hooks, synchronous effect flush, one render (ADR 0020); render every frame by default, opt-in on-demand; clamped variable `dt` plus opt-in fixed step; public `Frame` service in the canvas package; signals stay the channel for high-rate state (about 0.65 microseconds per binding re-run, 1,000 entities x 3 props = 1.9 ms in Node; past ~3,000 entities use refs); four additive core changes in total; engine optimisation only after a real browser profile. Measurements on branch `research/frame-cost-model`.
- [How does a canvas scene mount inside a DOM app? (canvas/110)](110-how-does-a-canvas-scene-mount-inside-a-dom-app.md): a DOM-hosted `<gable-canvas>` component declares a renderer boundary in `meta`; its template and projected children build with the Pixi renderer, sharing the host's scope and injector (ADR 0019); core gains only the boundary and `Renderer.destroy?()`; DOM and scene talk through DI-shared signals; size is an injected signal service; scene HMR keeps the Application, host edits recreate it.
- [What should a declarative game look like to author? (canvas/108)](108-what-should-a-declarative-game-look-like-to-author.md): entities are components (a `<game-ship>`, `<game-rock>` per entity, composed in the scene template, coordinating through injected services); direct node writes through template refs are a sanctioned fast path for high-count entities; the per-frame hook is an injected `Frame` service (`inject(Frame).onFrame(dt => ...)` as a field initialiser); scene tags and properties mirror Pixi names 1:1. Runnable prototype on branch `prototype/canvas-authoring`.
- [Which library do we bind to? (canvas/109)](109-which-library-do-we-bind-to.md): PixiJS 8 (child order is draw order, plain property writes, built-in events, text, graphics, masks, filters); 3D dropped from the effort, Three.js was the runner-up; engines (Phaser, Excalibur, melonJS, KAPLAY) were excluded. Spike on branch `research/canvas-library-spike`.
- [Which 2D/3D rendering libraries are viable, and how do they compare? (canvas/106)](106-which-2d-3d-rendering-libraries-are-viable-and-how-do-they-c.md): facts gathered for PixiJS 8.23, Three r187, Babylon 9.35, Phaser 4.2.1, Excalibur 1.0.0, Konva 10.9.1, Two.js, Canvas2D, plus melonJS, PlayCanvas and KAPLAY; open gaps (Pixi headless testing, Three WebGPU production status, Excalibur/Konva insert-at-index, Firefox WebGPU sources disagree) are marked unverified. Findings on branch `research/canvas-libraries`.
- [What does Gable core assume about the DOM, and what does a second renderer under a DOM app need? (canvas/107)](107-what-does-gable-core-assume-about-the-dom-and-what-does-a-se.md): the renderer is threaded through view building as an argument, not scoped per subtree, so a second renderer can only be mounted from code, and `createComponent` has no parent scope and does not install `renderer.providers`; native/106's Geometry/FrameScheduler/MediaQuery are not in the code; core has browser globals (idle, transitions) and `#ref` returns raw nodes. Findings on branch `research/renderer-seam-for-canvas`.

## Not yet specified

<!-- empty: the prototype (branch `prototype/pixi-renderer-spike`) sharpened the last fog into two tickets -->

## Out of scope

- Gable Native / native canvas (native/99 owns it).
- Physics, audio, ECS, networking, tilemap editors (separate efforts on top of this binding).
- Input action maps (binding "jump" to a key, button or tap) and remapping UIs: a layer on top of the Pointer, Keyboard and Gamepad services (canvas/113).
- A library-agnostic scene abstraction layer.
- A whole-app canvas renderer and template-level renderer-switching syntax: the hosting model is a DOM-hosted renderer boundary on a component (canvas/110, ADR 0019).
- 3D (a Three.js sibling binding or anything else): dropped by the human when the library was picked; Pixi has no in-library 3D and the effort is 2D only.
