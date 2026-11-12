---
id: TASK-104.1
title: Which 2D/3D rendering libraries are viable, and how do they compare?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T05:42:00Z'
updated_date: '2026-11-12T05:48:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-104
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Establish the facts the library decision waits on, for PixiJS v8, Three.js, Babylon.js, Phaser, Excalibur, Konva/Two.js and plain Canvas2D (add any strong candidate you find). For each: renderers supported (Canvas2D, WebGL, WebGPU) and how mature the WebGPU path is; whether it exposes a retained scene graph (display objects with transform, parent/child, z-order) that a Gable Renderer could drive node by node; 2D features (sprites, atlases, text and bitmap fonts, graphics/paths, masks, filters, blend modes, tilemaps, particles); what a 3D path looks like in the same library; hit-testing and pointer-event model; asset loading; whether it owns a game loop/ticker we would have to cooperate with; bundle size and tree-shaking; TypeScript quality; licence; release cadence and maintenance health; running headless or without a GPU for tests. Output: a comparison table and a short factual note per library, with sources linked. No recommendation; the pick is a separate ticket.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T05:48:00Z

---

Resolved by research on branch research/canvas-libraries (docs/research/canvas-libraries.md). Covered PixiJS 8.23, Three r187, Babylon 9.35, Phaser 4.2.1, Excalibur 1.0.0, Konva 10.9.1, Two.js, plain Canvas2D, plus melonJS, PlayCanvas, KAPLAY. Notable: Pixi docs say Canvas2D coming soon but 8.23 source has a canvas renderer preference; Phaser 4 keeps Canvas as deprecated; Three ships no bundled types; Three add() takes no index while Pixi has addChildAt; sources disagree on Firefox WebGPU. Unverified and listed in the doc: Pixi headless testing, Excalibur/Konva insert-at-index, Two.js events, Three WebGPU production status. Bundle sizes are whole-entry, not tree-shaken.

---
<!-- COMMENTS:END -->
