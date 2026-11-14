---
id: TASK-99.18
title: Vello and wgpu against Gable Native's rendering requirements
status: Done
assignee: []
created_date: '2026-11-07T23:10:00Z'
updated_date: '2026-11-07T23:23:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Gable Native chose Skia (skia-safe) behind a display-list boundary, with Vello a possible later alternative (see Architecture and host language). The user wants this revisited, and also wants WebGPU and WebGL eventually. What does Vello (the compute vello crate, Vello CPU and Vello GPU/Hybrid) support today against the rendering features already committed in the Styling model ticket and the canvas and media decisions: filter functions (blur, drop-shadow and the colour functions), backdrop-filter blur, 2D transforms plus single-element 3D with perspective and correct hit testing, blend modes and isolated layers, clipping, gradients, image drawing and external textures (video frames), text rendering quality (hinting, subpixel AA, colour glyphs) with Parley, the Canvas 2D operations (shadows, filters, composite operators), damage tracking, and low-end Android GPU behaviour (compute shader requirement, GLES fallback)? What are binary size, build, and platform status on Windows, macOS (Metal) and Android? Separately, what would it take to offer WebGPU (wgpu, Dawn, the Deno webgpu crate and other binding approaches) and WebGL (ANGLE, WebGL-over-WebGPU efforts, conformance suites) to canvas, how does a second GPU producer share textures with a Skia frame versus a Vello frame, and could Skia and Vello coexist (Vello for canvas only)? Facts and comparison only, no decision. Outcome may reopen the Skia choice in the Architecture ticket.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T23:13:00Z

---

User contingency, stated while the research runs: if Vello falls short of the committed rendering features, go hybrid, meaning Gable owns a UI-shaped renderer on wgpu (rounded rects, borders, shadows, gradients, images, glyph atlas text, blur and colour filters, 3D perspective, layers and backdrop reads) and adopts a path engine (Vello for paths only, or lyon with MSAA or analytic coverage) behind the display-list boundary. Fork or contribute to Vello, staying on Skia, and a fully owned renderer remain alternatives the findings should inform. The hybrid would be a second exception to the 'adopt commodity layers' principle, taken knowingly.

---

author: @jason
created: 2026-11-07T23:23:00Z

---

Resolved by research, facts only, no decision. Findings in docs/research/vello-wgpu-rendering.md on branch research/vello-wgpu-rendering (pushed, no PR). Key points: vello_gpu 0.3.0 supports only blur among filter functions (others unimplemented!), no backdrop-filter, affine-only transforms (no perspective/3D), masks and destructive non-isolated blends panic, layers always rendered in full (scissor damage PR #1737 open); compute Vello needs compute shaders (absent on GLES 3.0/WebGL2) with open Mali/Adreno issues; Parley is layout only, no LCD text. Skia covers all committed features (M44 perspective, SaveLayerRec backdrop, ImageFilters). Measured hello-world release sizes (Windows): vello_cpu 0.98 MB, vello_gpu+wgpu 5.1 MB, vello compute+wgpu 5.8 MB, skia-safe prebuilt 3.2 MB (16.1 MB with textlayout). Skia-on-wgpu (Graphite/Dawn on the app's wgpu device) is experimental, source-built, and is the route to shared textures; anyrender already has both Vello and Skia backends. Unverified: Android low-end device behaviour, macOS (CI only), Skia damage tracking and perspective AA. No injected instructions were found in fetched content.

---
<!-- COMMENTS:END -->
