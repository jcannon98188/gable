---
id: TASK-99.23
title: WebRender and other display-list renderers as the owned compositor
status: Done
assignee: []
created_date: '2026-11-08T00:02:00Z'
updated_date: '2026-11-08T00:17:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The renderer hybrid decision (ADR 0005) has Gable writing its own compositor and UI primitive pipelines on wgpu. Before the display-list boundary is designed, check the obvious prior art that was not evaluated: Mozilla's WebRender (Rust display-list renderer with spatial and clip trees, stacking contexts, picture caching, filters, backdrop-filter, 3D transforms with perspective, mask clips, glyph rasterization and an atlas). Can it be used standalone outside Gecko, and in what state: crate packaging and API stability, its GPU backend (OpenGL and GLES, any wgpu backend and its maturity), macOS (OpenGL deprecation, Metal or native compositor), Windows, Linux and Android behaviour and low-end GPUs, glyph rasterization (platform rasterizers versus Skrifa), damage and dirty-rect handling, binary size, build dependencies, MPL-2.0 consequences, and how Servo embeds it. Also look at other display-list renderers and designs for comparison: Servo's compositor, Blitz and anyrender, Xilem and Masonry scene, Flutter Impeller's display list, Zed GPUI, Chromium cc and viz as design reference. For each, evaluate against Gable Native's committed features (filters, backdrop-filter, perspective with picking, blend modes, masks, canvas op buffers, external video textures, damage tracking) and its constraints (Windows, macOS, Linux, Android; GLES 3.0 floor; the author cannot test on a Mac). Facts and comparison only, no decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-08T00:17:00Z

---

Resolved by research. Findings are in docs/research/webrender-display-list-renderers.md on branch research/webrender-display-list-renderers (pushed, no PR). Facts only, no decision. WebRender 0.70.1 is usable standalone (Servo embeds it) and covers Gable's list: all CSS filter functions, backdrop-filter, perspective with preserve-3d and built-in hit testing, 17 blend modes, image-mask and rect/rrect clips (path clips only upstream), external video textures, canvas via raw/blob/external images, and built-in tile-based damage. Constraints: GL 3.2/GLES 3.0 only, no wgpu backend (Bugzilla 2079598 is an empty placeholder), no Metal path (macOS relies on deprecated GL, ANGLE-Metal bug 2052515 not done), and wgpu/GL context sharing is unverified. Platform glyph rasterizers only; Skrifa exists on an unmerged fontations branch. Crates.io releases resumed in 2026 after a 6-year gap, with no stability statement and Servo as the only consumer; upstream is ahead of the crates. MPL-2.0 is file-level copyleft. Measured: probe binary 3.30 MB, cold build 2m08s, 67 crates, 9 MPL crates, needs a C++ compiler. Also compared anyrender/Blitz, Masonry/imaging, Impeller, GPUI and Chromium cc/viz. Unverified items are listed in section 12 (no Mac/Android/Linux runs). No prompt-injection instructions were found in fetched content.

---
<!-- COMMENTS:END -->
