# WebRender and other display-list renderers as the owned compositor

Research for TASK-99.23. Date: 2026-11-07. Facts and comparison only; no decision is made here.

Convention: a claim is **verified** when it was read from a primary source (repo source, README, docs, bug tracker) or measured locally. Anything else is tagged **(unverified)**.

## 1. Question and method

ADR 0005 has Gable Native own a hybrid wgpu renderer: Gable writes the compositor, UI primitive pipelines, damage tracking and glyph-atlas text, and adopts only path rasterisation (vello_gpu with vello_cpu) behind a Gable-owned seam. TASK-99.23 asks whether an existing display-list renderer, chiefly WebRender, could be the owned compositor instead, and how the other display-list designs compare. The committed feature set comes from TASK-99.8: filter functions (blur, drop-shadow, brightness, contrast, grayscale, saturate, hue-rotate, sepia, invert, opacity); backdrop-filter limited to blur and colour functions; 3D tier 1 (perspective(), rotateX, rotateY, translateZ on one element, ray-plane hit testing); isolated layers, backdrop reads and 4x4 matrices at the display-list boundary; blend modes, masks, clips; external video textures; canvas as an image source; damage tracking. Constraints: Windows, macOS, Linux, Android; GLES 3.0 floor; the author cannot test on a Mac.

Method: read the servo/webrender checkout at branch `0.70` (d399b90, 2026-10-28; the crates.io 0.70.x line), the canonical tree `gfx/wr` in mozilla-firefox/firefox, Gecko's `gfx/webrender_bindings`, Servo's `components/paint` and workspace Cargo files, crates.io metadata, Bugzilla, DioxusLabs/anyrender and blitz, linebender/xilem and forest-rs/imaging, GPUI (crates/gpui), flutter/flutter `engine/src/flutter/impeller`, and Chromium `cc` and `viz` READMEs and headers. Binary size and build time were measured with a probe (section 9). No device testing on macOS, Android or Linux was possible. Fetched content was treated as data; no embedded instructions addressed to an agent were found in any fetched page, README or source file.

## 2. Candidates and status

| Name | What it is | Status (from source) |
|---|---|---|
| WebRender 0.70.1 | Rust retained GPU display-list renderer, OpenGL/GLES only (gleam) | Production in Firefox; crates.io releases resumed 2026 after a 2020 to 2026 gap; MPL-2.0 |
| Servo `paint` | Servo's embedding of WebRender plus surfman GL contexts | Servo v0.7.0 (2026-10-05); workspace uses webrender 0.70.1 |
| anyrender 0.14.0 | Immediate-style `PaintScene` trait with Vello, Vello CPU, Vello hybrid and Skia backends | Pre-1.0, ~270k downloads, MIT/Apache |
| Blitz | HTML/CSS renderer over Stylo and anyrender | Beta |
| Xilem / Masonry with `imaging` | Retained scenes over Vello; new backend-agnostic imaging IR crates | Pre-1.0; `imaging` 0.0.1 (2026-05-21) |
| Flutter Impeller | Display list (`DlCanvas`) over Metal, Vulkan, GLES | Production in Flutter; standalone use (unverified) |
| Zed GPUI | Scene of typed primitives over Metal, D3D, wgpu | 0.2.2, pre-1.0, Apache-2.0 |
| Chromium cc and viz | Layer tree plus compositor frames of render passes and quads | Reference design; not embeddable in practice (unverified) |

## 3. Summary matrix

| Requirement | WebRender 0.70 | Servo paint | anyrender / Blitz | Masonry / imaging | Impeller | GPUI | Chromium cc/viz |
|---|---|---|---|---|---|---|---|
| Filter functions | Yes: blur, brightness, contrast, grayscale, hue-rotate, invert, opacity, saturate, sepia, drop-shadow, plus SVG filter graph (256-node cap); blur radius max 100 | Same (it is WebRender) | `Filter` DAG type; only Flood, GaussianBlur, DropShadow, Offset noted implemented for Vello; Blitz converts all CSS filter functions to it | Via imaging backends (unverified in detail) | Yes via `DlImageFilter` | None seen | Yes (render pass filters) |
| backdrop-filter | Yes in main; 0.70 has `BackdropFilterDisplayItem`, backdrop capture/render; upstream reworked it after 0.70 | Same | In the trait (`backdrop_filter` arg); Blitz converts it; backend support follows filter support | (unverified) | Yes: `SaveLayer` with backdrop filter | None seen | Yes (`RenderPassDrawQuad` backdrop filters) |
| Perspective and 3D | Yes: perspective reference frames, `Preserve3D`, backface visibility, plane-split sorting | Same | No: `Affine` only | (unverified) | Yes: `TransformFullPerspective` | None seen | Yes: 4x4 `quad_to_target_transform`, sorting contexts |
| Picking under 3D | Built in `hit_test.rs`: per-item inverse transform and 2D projection of the screen point, reverse list order, clips, backface rules; depth ordering inside preserve-3d not verified | Same | None | None | None (engine-side) | None | Hit testing is outside cc/viz (unverified) |
| Blend modes | 17 values including PlusLighter | Same | `blend` argument on `push_layer` | Yes | Yes | None seen | `SkBlendMode` per shared quad state |
| Masks and clips | Rect, rounded-rect, image-mask (`ImageMaskClip`), clip chains; path clips only upstream, after 0.70 | Same | `push_clip_layer`, layers | Yes | ClipPath, layers | Content masks per primitive; layers | rounded-corner mask info, mask resource |
| External video textures | `ExternalImageHandler` lock/unlock, `TextureExternal` (OES), YUV item, native-compositor `attach_external_image` | Used for WebGL and (via buffers) WebGPU | Backend dependent (unverified) | (unverified) | External textures (unverified detail) | `Surface` primitive | Video quads |
| Canvas as image | `ImageData::Raw` plus `update_image`, blob images, or external images | Servo canvas pushes raw image data | Image brush from app bitmaps | Same | `DrawImage`/`DrawDisplayList` | Sprites | Resources |
| Damage and dirty rects | Built-in: per-tile primitive-dependency invalidation, 1024x512 picture-cache tiles; partial present support | Inherits | None in anyrender; whole-scene repaint per frame (unverified for Blitz) | (unverified) | Not verified | No damage tracking found (unverified) | `DamageTracker`, per-pass `damage_rect` |
| GPU API | OpenGL 3.2 / GLES 3.0 only | surfman GL contexts | wgpu (Vello), CPU, Skia | wgpu, CPU, Skia | Metal, Vulkan, GLES | Metal, D3D, wgpu | GL, Vulkan, Metal, D3D via Skia (unverified) |
| GLES 3.0 floor | Yes: `#version 300 es` shaders | Yes (Android) | Via wgpu GLES (unverified) | same | GLES backend exists | wgpu GLES feature present | n/a |
| Licence | MPL-2.0 | MPL-2.0 | MIT/Apache (Blitz's Stylo stack MPL-2.0) | MIT/Apache | BSD-style (unverified) | Apache-2.0 | BSD (unverified) |

## 4. WebRender as a standalone component

### 4.1 Standalone usability outside Gecko

- WebRender is usable outside Gecko: Servo has embedded it since 2016 and still does. The `servo/webrender` repository carries standalone examples (`examples/*.rs`, using winit 0.30 and glutin 0.32), the `wrench` harness (YAML/RON replay and capture, 921 reftest YAML files), and an `example-compositor` directory with a Windows DirectComposition/D3D11/ANGLE compositor and a Wayland one. Verified from the checkout.
- The embedder API is a `Transaction` carrying display lists and resource updates: `set_display_list`, `generate_frame`, `append_dynamic_properties` (property-bound animation of transforms, opacity, colour), `set_scroll_offsets`, `add_image`, `update_image`, `add_blob_image`, `add_raw_font`, `add_native_font`. Instantiation is `create_webrender_instance(Rc<dyn gleam::Gl>, RenderNotifier, WebRenderOptions, ...)`. Verified.
- Threads: a scene builder thread, a render backend thread and a rayon pool; GL calls run on the embedder's render thread. Verified from `renderer/init.rs`.
- The model is retained and interned: the embedder builds a display list (spatial tree, clip tree, stacking contexts, primitives) and WebRender diffs it against the previous scene. This differs from an immediate-mode canvas trait; it fits a UI that already has a scene tree and wants scrolling and animation to run without rebuilding.
- Documentation: the Servo book's compositor page is a TODO and its embedding overview says documentation is sparse. The in-repo docs are thin. Verified from servo/book source.

### 4.2 Crate packaging and API stability

- Crates on crates.io: `webrender` 0.70.1 (2026-10-29), `webrender_api` 0.70.0, `webrender_build` 0.70.0, `wr_glyph_rasterizer` 0.70.1, `swgl` 0.70.0, `glsl-to-cxx` 0.70.0, all MPL-2.0; `wr_malloc_size_of` 0.2.2 and `peek-poke` 0.3.0 are MIT/Apache. Verified from crates.io.
- Release history of `webrender`: 0.58 (2019-01), 0.60, 0.61 (2020-01-15), then a gap until 0.68 (2026-01-28), 0.69 (2026-06-12), 0.70 (2026-07-10), 0.70.1. Verified. Total downloads about 420k.
- Reverse dependencies: 9 crates, all Servo-family plus `skryn` 0.0.4 (2019). Verified. In practice Servo is the only consumer.
- `servo/webrender` `main` is stale (last commit 2025-10-02, version 0.62); releases live on branches 0.63 to 0.70 and a `crates-io` branch. Canonical development is `gfx/wr` in mozilla-firefox/firefox. Verified.
- Upstream is very active: about 100 commits in the 30 days after 2026-10-08 (query capped at 100), mainly Nicolas Silva and Glenn Watson. Verified. Upstream is ahead of the crates: path tiler and path clips (Bug 2078306), a Layer compositor with swapchain (Bug 2084955), backdrop-filter reads from slices below (Bug 2079476), backdrop filters in snapshotted stacking contexts (Bug 2087923); none of these appear in 0.70 (`path_tile.glsl` is absent). Verified.
- There is no CHANGELOG and no GitHub releases, and no statement of semver or API stability was found. Between 0.68 and 0.70 the repo has 552 commits; how much of `webrender_api` changed could not be quantified (the compare API returned no diff for that crate). The API should be treated as changing with Gecko's needs (inference).

## 5. GPU backends and platforms

### 5.1 Backends

- The GPU layer is OpenGL only, through `gleam`. `device/gl.rs` is 4922 lines. Shaders are `#version 150` (GL 3.2 core) and `#version 300 es` (GLES 3.0), plus `#version 100` for external-OES. Verified.
- GPU buffer reads use `texelFetch` on highp float samplers; the minimum texture size assumed is 2048. Verified.
- There is no wgpu backend. No wgpu dependency exists in the 0.70 checkout nor in `gfx/wr/webrender/Cargo.toml` upstream. Verified.
  - Bugzilla 2079598 "Add an experimental wgpu-hal backend to WebRender": NEW, unassigned, filed by nical, empty body. Verified (it is a placeholder, not evidence of work).
  - Wu Yuwei's blog post of 2025-04-21 proposes a wgpu renderer; it is a proposal. Secondary.
  - The szeged/webrender gfx-hal fork (Vulkan, DX12, Metal) was last pushed 2020-03-03 and its README says it trails the original in performance. Verified.
  - Bugzilla 1735699 "Enable Vulkan rendering in Firefox / WebRender" is UNCONFIRMED. Verified.
- Consequence for ADR 0005's wgpu renderer: WebRender and wgpu cannot share a renderer. Mixing them needs GL interop between a gleam context on the embedder thread and a wgpu device. Whether wgpu's GLES backend can share or import that context is **(unverified)**.

### 5.2 Per platform

- Windows: Gecko uses `RenderCompositorANGLE` with DirectComposition (`DCLayerTree`) and D3D11 texture hosts; the repo's example-compositor shows the same pattern. Servo uses surfman with WGL, or ANGLE through mozangle under the `no-wgl` feature. mozangle is only a dev-dependency of webrender; ANGLE has to come from the embedder. Verified.
- macOS: Apple's page developer.apple.com/opengl says OpenGL was deprecated in macOS 10.14 and lists support from 1.x through 3.2 (retired doc). Gecko requests an `NSOpenGLProfileVersion3_2Core` context (`GLContextProviderCGL.mm`). The "4.1 maximum" figure appears only in secondary sources and is **(unverified)** from Apple. Gecko's native macOS compositor (`RenderCompositorNative`, `NativeLayerCA` over CALayer and IOSurface) is the platform path. There is no Metal rendering in WebRender; `MetalDeviceManager.mm` only returns the default Metal device's registry ID. Bugzilla 2052515 "Use the ANGLE Metal backend on macOS for webrender" is NEW. Verified. Servo uses surfman (CGL or Metal-backed). Any long-lived macOS plan therefore relies on a deprecated API or an unlanded ANGLE-Metal path, and the author cannot test either.
- Linux: Gecko has `RenderCompositorEGL`, DMABUF and Wayland compositors; Servo uses surfman over Wayland or X11. Verified.
- Android: GLES 3.0 shaders; Gecko has SurfaceTexture and HardwareBuffer texture hosts; Servo supports Android P and up through surfman. Verified from source; no on-device run.
- Low-end GPUs: `gl.rs` has 87 matching lines naming Mali, Adreno, PowerVR, Intel, AMD, NVIDIA, Mesa, ANGLE and emulators and about 20 bug references. Examples: partial render-target update disabled on Mali Midgard/Bifrost and PowerVR D-Series; render-target invalidate disabled on PowerVR Rogue and Mali Valhall r36p0; Adreno 3xx PBO stride alignment of 128; Adreno QCOM_tiled_rendering handling; batched uploads on Mali-G; macOS PBO stride 256 and no non-zero PBO offsets (AMD bug); texture storage disabled on macOS. Verified. This is a large accumulated workaround set, not a performance measurement; frame cost on low-end Android GPUs is **(unverified)**.
- Servo forces `use_optimized_shaders: true` because of an Android emulator bug (issue 31726). Verified.
- SWGL (software GL via `swgl` and `glsl-to-cxx`, a single-threaded 4xf32 span rasteriser) offers a no-GPU path; its build needs clang (clang-cl on Windows). Verified from the README. Quality and speed relative to vello_cpu are **(unverified)**.

## 6. Glyph rasterisation

- `wr_glyph_rasterizer` uses platform backends: CoreText on macOS (core-text 20.1), DirectWrite on Windows (dwrote 0.11.5), FreeType on Linux and Android (freetype 0.8, `static_freetype` default, compiled from freetype-sys). Verified.
- `push_text` takes `GlyphInstance {index, point}` and a `FontInstanceKey`: shaping is external, so Parley could supply glyph runs. Fonts are `FontTemplate::Raw(bytes, index)` or `Native(handle)`. Variations, synthetic bold/italic and embedded bitmaps are supported. Verified.
- Render modes: `Mono`, `Alpha`, `Subpixel` (default Mono), with BGR, vertical-LCD and subpixel-position flags, a gamma LUT and dual-source blend for LCD text. Glyphs are cached in WebRender's texture cache (an atlas). Verified.
- COLR colour fonts are decomposed by the embedder: the unix `font.rs` comment says COLR fonts are "handled internally by Gecko, and WebRender is just asked to paint individual layers". Verified. What Servo does for COLR is **(unverified)**.
- A Skrifa backend exists only on the unmerged servo/webrender `fontations` branch, by Nico Burns (Blitz author): skrifa 0.44, vello_cpu 0.1.0, yoke, memmap2; commits from 2026-08-06 (milestones M1 to M3, bitmap strikes, hinting options). Earlier PRs #4869 and #4872 were closed; swash and fontdue branches date from 2023 and 2025. Verified from branch listings. Not on crates.io.
- Glyph appearance therefore differs per OS under the shipped backends (CoreText, DirectWrite, FreeType) and would match Gable's Skrifa/Parley choice only if the fontations branch lands.

## 7. Damage and dirty rects

- WebRender does not take embedder damage. It caches pictures in 1024x512 tiles and invalidates tiles by comparing primitive dependencies between frames, so a scene with unchanged content redraws no tiles. Verified in `tile_cache/mod.rs`.
- `CompositorConfig::Draw`: WebRender composites tiles itself; `max_partial_present_rects` and `draw_previous_partial_present_regions` plus an optional `PartialPresentCompositor` support buffer-age partial present. `CompositorConfig::Native`: a `Compositor` trait (`create_surface`, `create_tile`, `bind`, `unbind`, `attach_external_image`, `CompositorCapabilities` with `max_update_rects` and `supports_surface_for_backdrop`) hands tiles to the OS compositor. `CompositorConfig::Layer`: a new experimental `LayerCompositor`. Verified.
- Servo does not implement the `Compositor` trait (it passes None); surfman lists "Partial presentation" as future work. Verified. So the best-supported damage mode in the standalone setting is Draw with partial present rects; whether that works on every GL driver Gable targets is **(unverified)**.
- Other designs: Chromium separates invalidation (layer content) from damage (final display) with `DamageTracker` and per-pass `damage_rect`; Zed GPUI: no damage tracking found **(unverified)**; anyrender exposes no damage concept.

## 8. Features against Gable's committed list

All verified in 0.70 source unless noted.

- **Filters.** `FilterOp` includes Blur, Brightness, Contrast, Grayscale, HueRotate, Invert, Opacity (property-bindable), Saturate, Sepia, DropShadow, ColorMatrix, SrgbToLinear, LinearToSrgb, ComponentTransfer, Flood, and an SVG filter-graph set (SVGFE*: blend, composite, convolve, displacement, lighting, morphology, tile, turbulence) capped at `SVGFE_GRAPH_MAX` = 256. `MAX_BLUR_RADIUS` is 100 for filters and 300 for box shadows. `MAX_SURFACE_SIZE` is 4096; larger render tasks are scaled down and look blurry.
- **backdrop-filter.** `BackdropFilterDisplayItem` with `BackdropCapture` and `BackdropRender` primitives; wrench has many reftests. Upstream has since reworked it. MDN lists backdrop-filter as Baseline 2024. Which Firefox release first shipped it was not checked.
- **Perspective and picking.** Reference frames may carry perspective (`ReferenceFrameKind::Transform` and `::Perspective`); `TransformStyle::{Flat, Preserve3D}` with the `plane-split` 0.18 crate for sorting; backface visibility. `hit_test.rs` walks items in reverse display-list order, projects the point through the inverse world-content transform, applies clips and backface rules and returns a list of `HitTestResultItem`. It does not sort by depth, so correct picking order for overlapping preserve-3d planes is **(unverified)**; for Gable's tier 1 (single element) the per-item ray-plane projection looks sufficient (inference).
- **Blend modes.** `MixBlendMode` has 17 values (Normal, Multiply, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion, Hue, Saturation, Color, Luminosity, PlusLighter).
- **Masks and clips.** `ImageMaskClip` (alpha mask image plus rect, fill rule, optional polygon points), rect and rounded-rect clips, clip chains. Arbitrary path clips exist upstream only (cs_path_tile.glsl), not in 0.70.
- **External video textures.** `ImageData::{Raw, External}`; `ExternalImageType::{TextureHandle(ImageBufferKind), Buffer}`; `ImageBufferKind::{Texture2D, TextureRect, TextureExternal (GL_TEXTURE_EXTERNAL_OES), TextureExternalBT709}`; the `ExternalImageHandler` lock/unlock returns a native GL texture id; a YUV image item exists. Servo's WebGPU path uses `ExternalImageType::Buffer` (CPU-mapped staging), not texture sharing.
- **Canvas as image source.** Raw image data with `update_image`, a blob-image rasteriser, or external images. Servo's 2D canvas uses CreateImage/UpdateImage with raw data; WebGL uses external image lock/unlock.
- **Isolated layers.** Stacking contexts become picture surfaces when they need a filter, blend, mask or non-trivial raster space; `SnapshotInfo` exists on stacking contexts. Verified existence; cost model not measured.
- **Mismatches with the ADR 0005 shape.** WebRender's renderer decides surface allocation, batching and tile caching itself; Gable would give up ownership of the compositor and of damage tracking, and the path rasteriser (vello_gpu) would have no entry point except as a blob-image or external-image producer (inference).

## 9. Binary size, build dependencies, MPL-2.0

### Measured

Probe: `webrender =0.70.1`, `webrender_api =0.70.0`, `gleam 0.15`, Windows x64, rustc 1.99.0, release with `lto = "fat"`, `codegen-units = 1`, `strip`, `panic = "abort"`. The probe references `create_webrender_instance` but never runs it (no GL context).

| Measurement | Value |
|---|---|
| Stripped binary | 3,300,864 bytes (shaders embedded: strings `ps_text_run`, `cs_blur`, `brush_image`, `#version 300 es`, `#version 150` present) |
| Cold build time | 2 min 08 s |
| Unique normal crates | 67 |
| Comparison from TASK-99.18 probes | wgpu alone 3.57 MB; vello_gpu + wgpu 5.1 MB; skia-safe raster 3.2 MB; skia + textlayout 16.1 MB |

The probe excludes windowing, a GL loader and fonts beyond what links by default; it is a lower bound. macOS and Android builds and runtime memory were not measured.

### Build dependencies

- A C++ compiler: `glslopt` (wraps C++ glsl-optimizer) runs in `build.rs` to pre-optimise shaders. SWGL additionally needs clang. FreeType is compiled from source on Linux and Android. ANGLE is not bundled. Verified.
- glsl-optimizer's own licence text was not checked **(unverified)**; the `glslopt` crate is MIT.

### Licences (Windows target graph)

MPL-2.0: app_units, dwrote, plane-split, tracy-rs, webrender, webrender_api, webrender_build, wr_glyph_rasterizer, zeitstempel (9 crates). The rest are MIT/Apache or similar. Verified from `cargo metadata`.

### MPL-2.0 consequences (from the mozilla.org text and FAQ)

- MPL-2.0 is file-level copyleft. A "Larger Work" (section 1.7) may be distributed under terms of your choosing (section 3.3), and static linking is allowed; new files with no MPL code need not be MPL.
- A "Modification" (section 1.10) includes any new file in Source Code Form that contains Covered Software, so edits or copied snippets of WebRender files must stay MPL and be published. Patches Gable needs to carry (for example a Skrifa glyph backend or GL fixes) would have to be published.
- For unmodified MPL code compiled into an executable, recipients must be told where to get the source. Section 2.1 grants a patent licence and section 5.2 terminates it for patent litigation.
- Blitz's licensing doc (secondary) reviews the same obligations for the Stylo stack and counts 426 packages in blitz and 675 in dioxus-native.
- This is a reading of licence text, not legal advice.

## 10. How Servo embeds WebRender

- `components/paint` (`painter.rs`, `webrender_external_images.rs`) calls `webrender::create_webrender_instance` with `WebRenderOptions` (including `use_optimized_shaders: true`) and no custom `Compositor` (None). Verified.
- GL contexts come from surfman 0.14: WGL or ANGLE on Windows, CGL on macOS, Wayland or X11 on Linux, EGL on Android. Verified.
- Servo's workspace pins webrender 0.70.1, vello 0.11, vello_cpu 0.2.0, wgpu-core 30 and surfman 0.14. Verified. Servo thus already holds WebRender (GL) and a wgpu stack side by side, bridged through CPU-visible buffers for WebGPU rather than shared textures.
- Servo is MPL-2.0 and bundles FreeType. Servo's COLR and font fallback integration was not examined.

## 11. Other display-list renderers

### anyrender 0.14.0 (DioxusLabs/anyrender)

- `PaintScene` trait: `push_layer(fill, blend, alpha, transform: Affine, clip, filter, backdrop_filter)`, `push_clip_layer`, `pop_layer`, `stroke`, `fill`, `draw_glyphs`, `draw_box_shadow`, `append_scene`; a `Scene` recording type exists. Transforms are 2D `Affine` only. Verified.
- `filters.rs` defines an SVG-style filter DAG; its status comment lists only Blur plus Flood, GaussianBlur, DropShadow and Offset as implemented for Vello. Backends: `anyrender_vello_hybrid`, `anyrender_vello_cpu`, `anyrender_vello`, `anyrender_skia` 0.12.0. No WebRender backend; the README welcomes contributions for tiny-skia and femtovg. Verified.
- It is a trait seam over rasterisers rather than a compositor: it has no damage, no 3D and no retained tree.

### Blitz

- `blitz-paint` converts Stylo filters (blur, brightness, contrast, grayscale, hue-rotate, invert, opacity, saturate, sepia, drop-shadow; `url()` returns None) and `backdrop-filter` into anyrender filters; no 3D or perspective code was found. Beta status. Verified at HEAD be60597 (2026-11-06).

### Xilem / Masonry

- `masonry_core` uses Vello; a new `masonry_imaging` crate adapts the forest-rs `imaging` crates (imaging 0.0.1, imaging_wgpu 0.0.2, imaging_vello 0.0.2, imaging_vello_hybrid, imaging_vello_cpu, imaging_skia 0.0.1), described as a "Backend-agnostic imaging IR and recording". Masonry builds retained scenes (base content plus overlays). The workspace uses wgpu 28. Verified at dc49687 (2026-11-03). The IR's filter, backdrop and 3D coverage was not read in detail **(unverified)**.

### Flutter Impeller

- Backends: Metal, Vulkan, GLES directories. `DlCanvas` API: `SaveLayer` with a backdrop `DlImageFilter`, `Transform(DlMatrix)` and `TransformFullPerspective`, `ClipPath`, `DrawShadow`, `DrawAtlas`, `DrawVertices`, `DrawDisplayList`. Shaders are compiled offline by `impellerc` from GLSL 4.60; an entity pass has a clip stack and a draw-order resolver. Verified from source.
- docs.flutter.dev (via a summariser): Impeller is the default on iOS and Android API 29+ (Vulkan), and on macOS, Linux and Windows "as of Flutter 3.47"; devices below API 29 or without Vulkan fall back to the legacy OpenGL renderer. This implies the GLES backend is not the primary Android path **(inference)**.
- It is C++ built with GN inside the Flutter engine; use outside Flutter, and the exact licence text, are **(unverified)**.

### Zed GPUI (crates/gpui 0.2.2, Apache-2.0)

- `PrimitiveKind`: Shadow, Quad, Path, Underline, MonochromeSprite, SubpixelSprite, PolychromeSprite, Surface; `PaintOperation` has `StartLayer(bounds)` and `EndLayer`. Renderers: Metal (gpui_apple), Direct3D with HLSL (gpui_windows), and `gpui_wgpu` (features metal, gles, vulkan, wgsl, webgpu; WGSL shaders; MSAA path texture; analytic blur box shadow). Verified.
- No layer filters, backdrop filter or perspective were seen; damage tracking was not found by search (unverified; code search was unreliable). Subpixel sprites provide LCD text. Android in the platform list: **(unverified)**.
- Closest in shape to ADR 0005's "own the primitive pipelines on wgpu" choice, but it is tied to Zed's primitive set.

### Chromium cc and viz

- cc README: `LayerTreeHost`, commit to pending/active trees, tiles, and "Damage is the equivalent of invalidation, but for the final display" (`DamageTracker`). viz aggregates surfaces from `CompositorFrame`s.
- `CompositorRenderPass` has `output_rect`, `damage_rect`, `transform_to_root_target`, `has_transparent_background`, `cache_render_pass`, `has_per_quad_damage`. `SharedQuadState` has a 4x4 `quad_to_target_transform`, optional `clip_rect`, `SkBlendMode`, opacity, rounded-corner `mask_filter_info` and `sorting_context_id`. `RenderPassDrawQuad` carries filters, backdrop filters and a mask resource. Verified from headers. This is the closest published design to the "isolated layers, backdrop reads and 4x4 matrices" boundary in TASK-99.21, and it is a design reference rather than an embeddable library (inference).

## 12. Gaps and unverified list

- No macOS, Android or Linux builds or runs; WebRender frame cost and memory on low-end Android GPUs.
- Whether wgpu's GLES backend can share or import a WebRender (gleam) GL context.
- Depth-correct hit testing within preserve-3d in WebRender.
- WebRender API churn rate between releases (552 commits between 0.68 and 0.70; diff of `webrender_api` not quantified).
- Apple's current maximum GL version (the 4.1 figure is secondary); outcome of the ANGLE-Metal bug.
- WebRender behaviour on blocklisted or software-only GPUs; full GL extension requirements (colour-buffer-float, dual-source blend fallbacks).
- Which Firefox release first shipped backdrop-filter.
- glsl-optimizer licence; Servo's COLR handling.
- Impeller and GPUI standalone use; Impeller licence text; GPUI damage tracking and Android support.
- imaging IR coverage of filters, backdrop and 3D.
- Chromium licence and embedding status.

## 13. Sources

- servo/webrender branch `0.70` (d399b90): `webrender/Cargo.toml`, `src/device/gl.rs`, `src/composite.rs`, `src/hit_test.rs`, `src/renderer/{init,mod,external_image}.rs`, `src/tile_cache/mod.rs`, `src/picture.rs`, `src/scene_building.rs`; `webrender_api/src/{display_item,display_list,image,font}.rs`; `wr_glyph_rasterizer/src/platform/*/font.rs`; `swgl/README.md`; `example-compositor/`, `examples/`, `wrench/reftests`; branches `fontations`, `crates-io`.
- mozilla-firefox/firefox: `gfx/wr` (commit history), `gfx/webrender_bindings`, `gfx/gl/GLContextProviderCGL.mm`.
- crates.io: webrender, webrender_api, webrender_build, wr_glyph_rasterizer, swgl, glsl-to-cxx, wr_malloc_size_of, peek-poke (versions, dates, downloads, reverse dependencies).
- Bugzilla: 2079598, 2052515, 1735699, 2078306, 2084955, 2079476, 2087923.
- Servo: `components/paint/{painter.rs,webrender_external_images.rs}`, workspace `Cargo.toml`, servo/book, surfman 0.14 README; issue 31726.
- szeged/webrender (gfx-hal fork); Wu Yuwei blog post of 2025-04-21 (secondary).
- Apple: developer.apple.com/opengl. MPL-2.0 text and FAQ on mozilla.org. MDN backdrop-filter.
- DioxusLabs/anyrender, DioxusLabs/blitz (`docs/licensing.md`), linebender/xilem, forest-rs/imaging.
- flutter/flutter `engine/src/flutter/impeller`; docs.flutter.dev Impeller page.
- Zed `crates/gpui`, `gpui_wgpu`, `gpui_apple`, `gpui_windows`.
- Chromium `cc/README.md`, `components/viz`, `render_pass.h`, `shared_quad_state.h`.
- Earlier research: `docs/research/vello-wgpu-rendering.md` (branch `research/vello-wgpu-rendering`, TASK-99.18); `docs/adr/0005-gable-native-owns-a-hybrid-renderer-on-wgpu.md`; TASK-99.20, TASK-99.8.
- Local probe: webrender 0.70.1 release build (section 9).
