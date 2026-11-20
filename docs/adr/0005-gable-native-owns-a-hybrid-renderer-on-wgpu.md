# Gable Native owns a hybrid renderer on wgpu

Gable Native's first renderer is Gable-owned and runs on wgpu: Gable writes the compositor (layers, blend modes, masks, clips, filters, drop shadows, backdrop-filter reads, 4x4 perspective), the UI primitive pipelines (rectangles, borders, shadows, gradients, images, external textures), damage tracking and glyph-atlas text composition, and adopts only arbitrary path rasterization (`vello_gpu`, with `vello_cpu` as the deterministic software renderer) behind a Gable-owned seam. This replaces the earlier working choice of Skia (`skia-safe`) behind a display-list boundary. Skia is not built or shipped, but the boundary stays renderer-neutral so Skia can be adopted instead if the prototype checkpoint fails.

Research (branch `research/vello-wgpu-rendering`) found Vello short of the features already committed in the styling model: only blur among the filter functions, no `backdrop-filter`, no perspective transforms, panicking mask layers and non-isolated destructive blends, no damage tracking, and no LCD text. Those are exactly the parts Gable owns here. One wgpu device from day one also gives WebGPU, a later WebGL layer, canvas and video a single GPU context, and avoids the C++ Skia build on macOS and Android.

## Considered options

Skia as v1 with the hybrid built second and a switch-over rule (as with the JavaScript engine): rejected by the maintainer, who wants the hybrid first. Vello alone: it lacks the committed features. Skia permanently: safest, but keeps a C++ build, a second GPU stack next to wgpu and no owned compositor.

## Consequences

The renderer is the largest and riskiest piece of the project and sits on the v1 critical path. There is no interim renderer to measure against, so the ship gates are the committed feature checklist, golden-image and differential tests against Chromium, performance budgets, the Android GPU matrix and macOS verification. A prototype spike carries an explicit checkpoint (text quality, low-end Android GPUs, macOS Metal through CI, blur and backdrop reads at frame rate, perspective with picking); the maintainer decides at that checkpoint whether to continue or adopt Skia. `vello_gpu`'s API is still moving, so it is pinned to a git revision and a second implementation (`lyon`) proves the path-rasterizer seam.
