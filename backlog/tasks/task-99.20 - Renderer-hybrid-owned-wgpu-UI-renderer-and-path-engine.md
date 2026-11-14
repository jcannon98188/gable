---
id: TASK-99.20
title: 'Renderer hybrid: owned wgpu UI renderer and path engine'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T23:29:00Z'
updated_date: '2026-11-07T23:33:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.18
parent_task_id: TASK-99
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The Vello and wgpu research found Vello short of the committed rendering features (filters beyond blur, backdrop-filter, 3D perspective, masks and non-isolated blends, damage tracking, low-end Android GPUs, LCD text). The user decided in advance: if Vello falls short, go hybrid. Reopen the renderer decision in Architecture and host language and decide: the owned UI-shaped renderer on wgpu (rounded rects, borders, shadows, gradients, images, glyph-atlas text, blur and colour filters, 3D perspective, layers and backdrop reads, damage tracking), the path engine it adopts (Vello CPU or GPU for paths only, lyon with MSAA or analytic coverage, or other), the text rendering approach with Parley, what happens to Skia in v1 (stay as the v1 renderer with the hybrid as a later swap behind the display-list boundary, versus building the hybrid first), the shared GPU context for canvas, video and a later WebGPU and WebGL, the Android GPU baseline (Vulkan, GLES fallback, software fallback), and how the display-list boundary changes. Must satisfy the macOS constraint. Findings: branch research/vello-wgpu-rendering.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T23:33:00Z

---

Resolved with the user; recorded in docs/adr/0005-gable-native-owns-a-hybrid-renderer-on-wgpu.md. Sequencing: v1 ships on the owned hybrid renderer on wgpu (the user rejected Skia-first with a switch-over rule); Skia is not built or shipped, but the display-list boundary stays renderer-neutral so Skia can be adopted instead if the prototype checkpoint fails, which the maintainer decides. Owned: display-list consumer, layer compositor (isolated layers, opacity, blend modes, masks, clips, filter functions, drop shadows, backdrop-filter reads, 4x4 perspective), UI primitive pipelines (rectangles, rounded rectangles, borders, box shadows, gradients, images, external textures), damage tracking and glyph-atlas text composition. Adopted: arbitrary path rasterization only, behind a Gable-owned seam: vello_gpu (sparse strips, no compute shaders, GLES 3.0 capable) and vello_cpu (deterministic software renderer for goldens and headless runs and the no-GPU fallback), both pinned to a git revision because the published API differs from main; a lyon fallback implementation of the seam is spiked as part of the checkpoint. Text: Parley layout, a glyph atlas with glifo and Skrifa (colour and bitmap glyphs), grayscale anti-aliasing in v1, LCD later if ever. Canvas: the 2D context records into a Gable-owned op buffer replayed by the owned renderer, replacing the Skia picture wording of the media and canvas decision; Skia types never appear in canvas or media code. GPU baseline: Vulkan, Metal or D3D12 first, GLES 3.0 second on Android and Linux, CPU rasterization last through vello_cpu; the compute-based vello crate is not used; device set and minimum Android API level fall to the packaging ticket. Ship gates (no interim renderer to switch from): the committed feature checklist passes (every filter function, backdrop-filter blur and colour functions, blend modes, masks, 3D perspective with correct hit testing, gradients, canvas ops); the golden-image suite passes within tolerance; the differential suite against Chromium (whose Skia rendering is the visual oracle) shows text and visual parity within agreed tolerances; the benchmark budgets are met; the Android GPU matrix (Vulkan and GLES, including low-end Mali and Adreno) shows no failures; macOS verification through CI plus a hosted Mac session. Checkpoint: a prototype spike proves, on real targets, text quality, low-end Android GPU behaviour, macOS Metal through CI, blur and backdrop reads at frame rate, and perspective with picking; failing a named criterion means the maintainer chooses between continuing and adopting Skia as the v1 renderer behind the same boundary. The display-list boundary becomes its own ticket with fixed requirements (renderer-neutral, isolated layer groups, backdrop reads, 4x4 matrices with perspective, damage rectangles, external images, canvas op buffers, picking data, stable serialization for golden tests). Consequences: wgpu is the single GPU layer from day one so WebGPU, a later WebGL layer, canvas and video share one device; the renderer is the largest and riskiest piece on the v1 critical path. macOS: Metal through wgpu, verified by CI and a hosted Mac session.

---
<!-- COMMENTS:END -->
