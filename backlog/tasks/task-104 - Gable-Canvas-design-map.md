---
id: TASK-104
title: Gable Canvas design map
status: To Do
assignee: []
created_date: '2026-11-12T05:41:00Z'
updated_date: '2026-11-12T06:37:00Z'
labels:
  - wayfinder:map
dependencies: []
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Destination

A spec and a set of locked decisions, ready to turn into build tickets, for a declarative canvas/WebGL/WebGPU binding that lets signal-driven Gable apps make 2D graphical games on PixiJS 8. The effort ends when what to build is clear; prototypes are only artifacts to react to, not deliverables.

## Notes

- Browser only. Gable Native (map TASK-99) is out of scope; keep the tag vocabulary free of DOM-isms so it could later map onto Native's renderer.
- The binding is a Gable `Renderer<N>` implementation: templates describe a scene (`<sprite [x]="x()">`), nodes are PixiJS 8 display objects, signal writes update only changed properties (retained mode). A thin DOM-hosted component (`<gable-canvas>`) lets a scene sit inside a normal DOM app for HUDs and menus.
- Bind to PixiJS 8 directly (no second abstraction layer beyond the Renderer contract). 2D only; 3D is dropped from this effort.
- Scope of "making games": scene binding, frame loop and timing, input events, asset loading, hit-testing, animation hooks. Physics, audio, ECS/entity frameworks, networking and tilemap editors are separate efforts.
- Gable rules apply: plain classes with `static meta`, static `html` templates with no `${}` holes, simple template expressions. Vocabulary: see GLOSSARY.md (Renderer, Platform services, Test renderer).
- Skills for sessions: grilling and domain-modeling for HITL tickets; research for research tickets.

## Decisions so far

<!-- the index: one line per closed ticket -->

- [What should a declarative game look like to author? (TASK-104.3)](backlog/tasks/task-104.3%20-%20What-should-a-declarative-game-look-like-to-author.md): entities are components (a `<game-ship>`, `<game-rock>` per entity, composed in the scene template, coordinating through injected services); direct node writes through template refs are a sanctioned fast path for high-count entities; the per-frame hook is an injected `Frame` service (`inject(Frame).onFrame(dt => ...)` as a field initialiser); scene tags and properties mirror Pixi names 1:1. Runnable prototype on branch `prototype/canvas-authoring`.
- [Which library do we bind to? (TASK-104.4)](backlog/tasks/task-104.4%20-%20Which-library-do-we-bind-to.md): PixiJS 8 (child order is draw order, plain property writes, built-in events, text, graphics, masks, filters); 3D dropped from the effort, Three.js was the runner-up; engines (Phaser, Excalibur, melonJS, KAPLAY) were excluded. Spike on branch `research/canvas-library-spike`.
- [Which 2D/3D rendering libraries are viable, and how do they compare? (TASK-104.1)](backlog/tasks/task-104.1%20-%20Which-2D-3D-rendering-libraries-are-viable-and-how-do-they-compare.md): facts gathered for PixiJS 8.23, Three r187, Babylon 9.35, Phaser 4.2.1, Excalibur 1.0.0, Konva 10.9.1, Two.js, Canvas2D, plus melonJS, PlayCanvas and KAPLAY; open gaps (Pixi headless testing, Three WebGPU production status, Excalibur/Konva insert-at-index, Firefox WebGPU sources disagree) are marked unverified. Findings on branch `research/canvas-libraries`.
- [What does Gable core assume about the DOM, and what does a second renderer under a DOM app need? (TASK-104.2)](backlog/tasks/task-104.2%20-%20What-does-Gable-core-assume-about-the-DOM-and-what-does-a-second-renderer-under-a-DOM-app-need.md): the renderer is threaded through view building as an argument, not scoped per subtree, so a second renderer can only be mounted from code, and `createComponent` has no parent scope and does not install `renderer.providers`; TASK-99.7's Geometry/FrameScheduler/MediaQuery are not in the code; core has browser globals (idle, transitions) and `#ref` returns raw nodes. Findings on branch `research/renderer-seam-for-canvas`.

## Not yet specified

- HMR for game state: keeping scene and game state across edits. Waits on the hosting model.
- Accessibility and DOM interplay for canvas content. Waits on the hosting model.
- Package layout, naming and the public API surface. Waits on most of the above.
- Performance budgets and devtools support. Waits on the update model.

## Out of scope

- Gable Native / native canvas (TASK-99 owns it).
- Physics, audio, ECS, networking, tilemap editors (separate efforts on top of this binding).
- A library-agnostic scene abstraction layer.
- 3D (a Three.js sibling binding or anything else): dropped by the human when the library was picked; Pixi has no in-library 3D and the effort is 2D only.
<!-- SECTION:DESCRIPTION:END -->
