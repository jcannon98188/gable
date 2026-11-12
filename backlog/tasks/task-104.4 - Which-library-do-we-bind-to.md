---
id: TASK-104.4
title: Which library do we bind to?
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T05:42:00Z'
updated_date: '2026-11-12T06:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.1
parent_task_id: TASK-104
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

With the library research in hand, pin the selection criteria and their weights with the human (2D-first with a credible 3D path, scene graph fit with the Renderer contract, WebGPU readiness, size, maintenance, licence, test story) and decide the one library the node types bind to. Record the runners-up and why they lost.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Settled with the human (round 1): (1) game engines (Phaser, Excalibur, melonJS, KAPLAY) are dropped; field is rendering libraries: PixiJS, Three.js, Babylon.js, with Konva/Two.js as 2D-only fallbacks. (2) Prefer the same library doing real 3D, but 3D is a preference not a hard requirement: if 3D through Three/Babylon is a big problem (2D conveniences, text, pixel coordinates, pointer events), strong 2D wins. (3) WebGL default is fine; the library must ship a maintained WebGPU renderer. (4) Hard pass/fail: permissive licence, TypeScript types (bundled or lockstep @types), retained scene graph with child ordering drivable from the Renderer contract, a release in the last six months. Weighed: tree-shaken size, 2D conveniences (text, atlases, hit-testing), headless testability, maintenance cadence. Pending: empirical spike on branch research/canvas-library-spike (headless construction, insert-at-index, property writes, events, Three 2D, Pixi 3D, minimal bundles), then weights and the final pick.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T06:09:00Z

---

Decision: bind to PixiJS 8. Why: child order is draw order (addChildAt), property writes are plain and take effect on the next render, federated events, text, graphics, masks, filters and tiling are built in, so the Renderer contract maps thinly; Three.js would need derived renderOrder, read-only position/rotation/scale needing .set(), our own raycaster event system, and 2D text/graphics glue. Three.js was the runner-up. 3D dropped from the effort by the human (Pixi has no in-library 3D). Game engines excluded; hard requirements: permissive licence, types, scene graph with ordering, recent release; WebGL default with a maintained WebGPU renderer. Evidence: branches research/canvas-libraries and research/canvas-library-spike.

---
<!-- COMMENTS:END -->
