---
id: TASK-99.21
title: Display-list boundary for Gable Native
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T23:33:00Z'
updated_date: '2026-11-08T00:22:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.23
parent_task_id: TASK-99
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Design the renderer-neutral display-list boundary between style, layout and the painter, consumed by the owned wgpu hybrid renderer (and by Skia if the prototype checkpoint forces that fallback). Requirements already fixed: no Skia types; isolated layer groups; backdrop reads; 4x4 matrices with perspective; damage rectangles; external images (video frames); canvas op buffers recorded on the JS thread; picking data (hit testing under transforms and clips); stable serialization for golden tests. Decide: the display-list structure and layer model, how damage and invalidation flow, how picking and accessibility bounds are produced, how scrolling and sticky layers composite, text and glyph run representation, resource lifetimes (images, textures, atlases), and the threading handoff from the layout thread to the UI thread. Must satisfy the macOS constraint. See ADR 0005 and the Vello and wgpu research.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-08T00:22:00Z

---

## Resolution

Decided with the maintainer in two grilling rounds, informed by the WebRender and display-list renderer research (the closest design references are Chromium cc/viz and Impeller's display list; WebRender itself is GL-only and does not replace the owned compositor).

- **Structure**: a flat ordered list of paint items referencing transform/scroll, clip and effect trees by id, plus a sibling hit-test tree. No Skia or wgpu types in the boundary.
- **Threading**: style, layout and paint run on the main UI thread and produce an immutable reference-counted snapshot. v1 submits it on that same thread (no render thread), but the snapshot shape allows one later. Canvas op buffers recorded on the JS thread cross by value at flush.
- **Resources**: items refer to images, video frames, canvas surfaces and fonts by id plus generation. The renderer owns the resource table, uploads, eviction and atlases; the painter sends add/update/drop messages. Video frames are acquired per frame and released when unreferenced.
- **Text**: one item per shaped glyph run (font id, size, glyph ids and positions, brush, decoration spans, text bounds). The display list never rasterizes; the glyph atlas is internal to the renderer.
- **Serialization**: one canonical, round-trippable text form (deterministic JSON or RON) of items, the trees, resource ids and damage, with quantized floats. Used for goldens and for replay into the software renderer.
- **Layers**: only opacity below 1, filters, non-normal blend modes, masks, backdrop-filter and 3D flattening create isolated layers, marked as effect-tree nodes. The renderer decides the surfaces, tiling and caching.
- **Damage**: the painter diffs against the previous list by node id and per-item content hash and sends window-space rectangles. Transform-only changes damage old and new bounds; filter and backdrop effects expand by their reach. The renderer may always widen to a full repaint (resize, device loss).
- **Picking and accessibility**: one hit-test tree built in the same pass from the same transform and clip trees (node handle, bounds, transform and clip node, paint order). 4x4 inverse and perspective projection run on the CPU. AccessKit reads its bounds from it, so hit testing, accessibility and pixels cannot disagree.
- **Scroll and sticky**: scroll containers are transform-tree scroll nodes with a content rect and viewport clip; sticky is a derived transform node. Offsets are inputs changed without repaint. Tiling stays internal to the renderer.
- **Canvas and video**: leaf items referencing resources. The canvas op buffer is replayed by the renderer into its own surface; video is an external-image item. Filters, masks and transforms apply with no special cases.
- **macOS**: nothing depends on a platform API; wgpu uses Metal and the software renderer replays lists for CI goldens.

No ADR: the shape is conventional and cheap to change before code exists.

---
<!-- COMMENTS:END -->
