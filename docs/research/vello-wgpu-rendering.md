# Vello and wgpu against Gable Native's rendering requirements

Research for TASK-99.18. Date: 2026-11-07. Facts and comparison only; no decision is made here.

Convention: a claim is **verified** when it was read from a primary source (repo source, changelog, README, docs, issue) or measured locally. Anything else is tagged **(unverified)**.

## 1. Question and method

Gable Native (TASK-99.8, 99.6) committed to Skia via skia-safe behind an internal display-list boundary, with Vello named as a possible later swap. The committed feature set: filter functions (blur, drop-shadow, colour functions, opacity) via isolated offscreen layers; backdrop-filter limited to blur and colour functions; 3D transforms tier 1 (perspective, rotateX/Y, translateZ with ray-plane hit testing, 4x4 matrices in the display list); blend modes, isolated layers, clipping; Parley for text; low-end Android GPUs.

Method: read linebender/vello (main, source of `vello_cpu`, `vello_gpu`, `vello`, `glifo`), changelogs, open issues; wgpu 30.0.1 README and changelog; rust-skia (skia-safe 0.157.0) source and docs; Dawn, ANGLE, deno_webgpu, gpuweb/cts, Servo Cargo files; DioxusLabs/anyrender. Binary sizes were measured with probe projects (section 8). No device testing on Android or macOS was possible.

## 2. The candidates

| Name | What it is | Status (from source/README) |
|---|---|---|
| `vello_cpu` 0.3.0 | CPU rasteriser, SIMD, optional multithreading | Described as the most mature |
| `vello_gpu` 0.3.0 (renamed from `vello_hybrid`) | "Sparse strips": CPU preprocessing, GPU raster/composite. wgpu and WebGL2 backends. No compute shaders (none found in render/wgpu) | Maturing |
| `vello` 0.11.0 | Compute-centric GPU renderer; needs compute shaders | README calls it alpha; under research/ "experimental" |
| `glifo` 0.4.0 | Glyph runs, hinting, COLR/bitmap glyphs, atlas | "experimental" |
| Skia (skia-safe 0.157.0) | Ganesh/Graphite, GL/Vulkan/Metal/D3D, prebuilt binaries | Production, Chrome/Android |

Shared crates: vello_common, vello_gpu_shaders, peniko, kurbo. MSRV Rust 1.89. Licence Apache-2.0 OR MIT.

Main-vs-published drift (verified by compiling): the main branch has `RenderTarget`, `RenderOptions`, and a `wgpu_external_texture` feature; published `vello_gpu` 0.3.0 has `Renderer::new(&device,&config)`, `create_depth_texture_view`, and a long-argument `render(...)` with `TargetInit`, and no external-texture feature. The API is moving between releases.

## 3. Summary matrix

| Requirement | vello_cpu | vello_gpu 0.3.0 | vello (compute) | Skia (skia-safe) |
|---|---|---|---|---|
| Filter functions: blur | Yes (multithreaded mode does not support filters) | Yes (`FilterFunction::Blur` only) | Not implemented; #476 open | Yes (SkImageFilters::Blur) |
| Other filter functions (brightness, etc.) | `unimplemented!` | `unimplemented!`; primitives: Flood, GaussianBlur, DropShadow, DropShadowOnly, Offset; multi-primitive graphs panic | No | Yes (ColorFilter, DropShadow, Merge, Blend...) |
| backdrop-filter | No | No (Blitz #1491 lists as unchecked) | No | Yes: `SaveLayerRec::backdrop(ImageFilter)` |
| 3D transform / perspective | No (kurbo `Affine` only) | No (`set_transform(Affine)`) | No (affine) | Yes: `concat_44`, `set_matrix(&M44)`, `M44::perspective` |
| Hit testing under 3D | Not provided by any renderer; app-side math | same | same | same (app-side math; the renderer only draws) |
| Blend modes | Yes | Yes, but destructive modes for non-isolated blending panic | Yes | 29 modes |
| Isolated layers / opacity | Yes | Yes (`push_layer(clip, blend, opacity, mask, filter)`) | Yes | Yes (saveLayer) |
| Mask layers | Yes (luminance) | `unimplemented!` / panic | Luminance mask layers | Yes |
| Clipping | Path clip | Path clip via layers | Path clip | rect, rrect, path, shader, region |
| Gradients | linear, radial, sweep, `interpolation_cs` via peniko | same | same | linear, radial, two-point conical, sweep, colour-space interpolation incl. OKLab |
| Images | Yes | Uploaded, atlas, external textures via `TextureBindings` | `register_texture`, `override_image` | Yes, plus GPU texture wrap |
| Text | Parley + glifo | Parley + glifo | Parley (+ glyph runs) | Own shaper path or SkParagraph (textlayout); Parley can feed glyph runs |
| Damage rects | No equivalent | Not in 0.3.0; PR #1737 (open) adds `RenderRegion::Rects` scissor. Layers always rendered in full | No | No built-in damage tracking found; app-side clip to damage rect (unverified how well backends cull) |
| Low-end Android GPU | N/A (CPU) | Indirect evidence only (4.10) | Open issues on Mali and Adreno | Mature (prebuilt Android arm64) |

## 4. Per-feature detail

### 4.1 Filters
- vello_gpu 0.3.0: `Filter::from_function` matches `FilterFunction::Blur` only; everything else hits `unimplemented!`. `PreparedFilter::new` handles Flood, GaussianBlur (anisotropic), DropShadow, DropShadowOnly, Offset; other primitives `unimplemented!("Other filter primitives not yet implemented")`. Blur uses decimation with downsampling. CPU multithreaded mode does not support even simple filters. Source: vello_common filter_effects and the vello_gpu filter code.
- vello compute: blur/filters tracked by open issue #476.
- Skia: `SkImageFilters` covers blur, drop shadow, colour filter, blend, merge, matrix transform. `SkBlurEngine` has per-backend algorithms with a maximum sigma and caller-side downscale. Source: SkBlurEngine.h.
- Committed requirement (damage rectangles grown by the filter extent): neither Vello renderer exposes filter extents to the caller in the code read (unverified beyond that reading); Skia's `SkImageFilter` bounds API was not checked in this pass (unverified).

### 4.2 Backdrop-filter
Vello: no renderer has a backdrop read of the parent layer; Blitz's tracking issue #1491 (DioxusLabs/blitz) lists backdrop filters unchecked. Skia: `SaveLayerRec::backdrop(ImageFilter)` plus `backdrop_tile_mode` (SkCanvas.h, skia-safe canvas.rs).

### 4.3 3D transforms and hit testing
Vello transforms are kurbo `Affine` (2D). No perspective in any of the three renderers. Skia accepts a 4x4 via `M44`. Hit testing in both cases is app-side (ray-plane intersection against the transformed quad); no renderer provides it. How Skia handles AA, clips and filters under perspective was not verified (unverified).

### 4.4 Blend modes, layers, clipping
vello_gpu supports blend and opacity layers, but destructive blend modes for non-isolated blending panic (source). Mask layers panic. `LayersConfig` exposes max_textures, min_texture_size (512) and max (4096) with a note that mobile GPUs prefer smaller intermediate textures. Compute Vello has layers, blend, clip, luminance masks, blurred rounded rect. Skia: full set.

### 4.5 Gradients
Both use peniko-style gradients (linear, radial, sweep, with interpolation colour space). Skia adds two-point conical and several interpolation colour spaces.

### 4.6 Images and external textures
- vello_gpu main: wgpu `ExternalTexture`/`texture_external` binding through `TextureBindings`; not in published 0.3.0.
- vello compute: `register_texture`, `override_image`, `render_to_texture`.
- Skia: `SkImages::BorrowTextureFrom` (Ganesh), Graphite BackendTextures; the media research (`native-media-playback.md`) covers frame sources.

### 4.7 Text quality with Parley
- Parley 0.12.0 is layout only: Fontique (enumeration and fallback; backends android, coretext, dwrite, fontconfig), HarfRust, Skrifa, ICU4X.
- Glifo handles hinting, COLR and bitmap glyphs, atlas, embolden.
- Open issues: hinted-glyph row rounding (#2020); RGB subpixel/LCD not implemented (issue #204 from 2022 says none, #1692 only "consider"); conflation artifacts (#49, #1953).
- Skia: `Font::Edging::kSubpixelAntiAlias`, `SkPixelGeometry`, hinting, subpixel positioning, embolden; raster_tragedy notes document gamma/contrast hacks.
- Skia can draw glyph runs positioned by Parley (shaping is independent of the rasteriser). Parley/Fontique output quality on each OS was not tested (unverified).

### 4.8 Canvas 2D operations
Mapping from the canvas research (`native-canvas-2d.md`): Servo's canvas uses vello_cpu by default and `vello` through an optional feature (Servo Cargo files). Operations missing from the Vello GPU renderers per the sections above: filters beyond blur, destructive `globalCompositeOperation` modes, 3D. skia-canvas mirrors Canvas 2D state stacks on Skia.

### 4.9 Damage tracking
vello_gpu 0.3.0 renders layers in full; PR #1737 (open) adds scissor `RenderRegion::Rects`; vello_cpu has no equivalent. Skia: no built-in damage tracking found; clip-to-damage is app-side (efficiency unverified).

### 4.10 Low-end Android GPUs
Evidence (all indirect; no device test was run here):
- vello compute: clip_leaf fix for Android/Vulkan (#1637); device lost on Mali Immortalis, Pixel 9 (#1816, open); Adreno 7xx under Chrome, 8 of 23 compute pipelines fail (#1957, open); older low-fps/glitch issues (#723, #765).
- vello_gpu: changelog 0.2.0 includes a Mali-G52 WebGL fix; `LayersConfig` note about mobile texture sizes.
- wgpu: GLES 3.0+ is "downlevel"; `DownlevelFlags::COMPUTE_SHADERS` is absent on GLES 3.0 and WebGL2, so compute Vello cannot run there; vello_gpu (no compute) targets GLES/WebGL2.
- Skia: prebuilt Android arm64 (API 26+) with GL and Vulkan.

## 5. Platform status

| Platform | wgpu 30.0.1 backend | Notes |
|---|---|---|
| Windows | Vulkan, DX12 first-class; GL downlevel | vello_gpu and vello compute both ran headless on this Windows machine ("ok") |
| macOS | Metal first-class; GL via ANGLE | **Not verifiable locally; only via CI.** No macOS test was run |
| Linux | Vulkan first-class | not tested here |
| Android | Vulkan first-class; GL downlevel (GLES 3.0+) | no device test; see 4.10 |
| iOS | Metal first-class | not tested |

Skia prebuilt platforms (rust-skia 0.157.0): Windows, macOS (Metal), Linux, Android.

## 6. WebGPU and WebGL options

- **wgpu 30.0.1**: backs WebGPU in Firefox, Servo and Deno (README). Interop APIs in the changelog: `create_texture_from_hal` (with `initial_state`), `vulkan::Device::texture_from_dmabuf_fd`, `dx12::Texture::with_plane_slice`, `create_texture_from_webgpu_handle`, `create_texture_from_webgl_handle`, `import_external_texture` (web video frames). `EXTERNAL_TEXTURE` "currently only supported on DX12" per the v28 note.
- **Dawn**: BSD-3, implements webgpu.h, D3D12/Metal/Vulkan/GL, Tint compiler. docs/support.md: Vulkan on Android "work in progress", Metal on macOS 13+, GL ES 3.1 in progress, D3D11 WIP. Chrome on Android uses Dawn (seen in Vello issue #1957). Rust binding `dawn-rs` 0.1.2 has about 446 downloads (young).
- **deno_webgpu**: in-tree crate in gfx-rs/wgpu (v0.181.0, publish=false) depends on deno_core (V8); a separately published `deno_webgpu` 0.227.0 exists on crates.io. wgpu runs a subset of the gpuweb CTS through `cts_runner` and `cargo xtask cts` (`cts_runner/test.lst`).
- **ANGLE**: GLES 2/3.0/3.1 on D3D11, Vulkan, Metal, desktop GL, GLES; WebGPU backend "work in progress" (doc/WebGLOnWebGPU.md). Used by Chrome and Firefox on Windows. `mozangle` 0.7.1 and `surfman` 0.14.0 exist on crates.io.
- **Conformance suites**: gpuweb/cts is normative with a standalone runner; the Khronos WebGL repo holds the WebGL conformance suites. Running the WebGL CTS from a non-browser host was not verified (unverified).
- **Servo** as prior art: canvas via vello_cpu (default) / `vello` (feature); webgpu via wgpu-core 30; webgl via surfman 0.14 and glow.

## 7. Texture sharing with Skia vs Vello frames

- Skia on wgpu: rust-skia feature `wgpu` (`wgpu-30`) runs **Graphite's Dawn backend on the app's `wgpu::Device`** through a Rust shim exporting 106 `webgpu.h` functions (m157). API in `skia-safe/src/gpu/graphite/wgpu.rs`: `context_factory::make_wgpu(&device,&queue)`, `surfaces::wrap_texture`, `images::wrap_texture`. Skia and the app share one device, queue and textures. Caveats from the ADR and FEATURES.md: ADR status "proposed", backend "experimental", no prebuilt binaries (builds Skia from source; downloads Dawn headers, about 26 MB, plus Jinja2/MarkupSafe); naga acceptance of Skia's WGSL not yet verified; wgpu validation adds CPU overhead; a lost device aborts the process; Ganesh has had no Dawn since 2023.
- Skia native backends: `SkImages::BorrowTextureFrom` (Ganesh), Graphite BackendTextures.
- Vello GPU renderers render into a `wgpu::TextureView` you provide, so output is a wgpu texture; vello compute has `render_to_texture`.
- Other-API sharing: wgpu hal imports (section 6); ANGLE EGL extensions for texture import: EGL_ANGLE_d3d_texture_client_buffer, EGL_ANGLE_iosurface_client_buffer, EGL_ANGLE_metal_texture_client_buffer, EGL_ANGLE_vulkan_image, EGL_ANGLE_webgpu_texture_client_buffer.

## 8. Binary size and build (measured)

Probes: Windows x86_64, rustc 1.99.0, release, `lto=fat`, `codegen-units=1`, `strip`, `panic=abort`. These are hello-world-class probes, not representative of a full app.

| Probe | Size (bytes) |
|---|---|
| empty Rust program | 119,296 |
| vello_cpu 0.3.0 (fill rect to Pixmap; ran, printed 4096) | 976,896 |
| wgpu 30.0.1 alone (device and texture) | 3,566,592 |
| vello_gpu 0.3.0 + wgpu (headless render; ran ok) | 5,103,104 |
| vello 0.11 compute + wgpu (ran ok) | 5,838,336 |
| skia-safe 0.157 default features, raster rect only (prebuilt; ran, printed 64) | 3,204,608 |
| skia-safe + textlayout, raster paragraph | 16,115,712 |

Build times (indicative only; builds ran concurrently): skia-safe prebuilt path about 21 s once downloaded; vello compute probe 1m39s cold.

Prebuilt Skia archives (compressed, rust-skia/skia-binaries 0.157.0; static libraries, not linked app size):

| Target and features | Compressed |
|---|---|
| Windows x64, ganesh-gl pdf | ~8.1 MB |
| Windows x64, with textlayout | ~24 MB |
| Windows x64, d3d + gl + textlayout | ~26 MB |
| Windows x64, no ganesh, textlayout | ~21 MB |
| macOS arm64, ganesh-gl metal pdf | ~5.0 MB |
| macOS arm64, with textlayout | ~18 MB |
| macOS arm64, graphite-metal pdf | ~4.2 MB |
| Android arm64, ganesh-gl pdf | ~6.7 MB |
| Android arm64, textlayout, gl, vulkan | ~19.8 MB |
| Android arm64, graphite-vulkan pdf | ~6.1 MB |

Skia built from source (needed for the wgpu feature) was not measured.

## 9. Can Skia and Vello coexist?

- Abstraction precedent: DioxusLabs/anyrender (0.14.0, 2026-10-03) is a "Rust 2D drawing abstraction" with backends `anyrender_vello_hybrid` (vello_gpu), `anyrender_vello_cpu`, `anyrender_vello`, and `anyrender_skia` (skia-safe). Content renderers (blitz-paint, anyrender_svg) sit on top. This shows one trait driving both engines in an existing project; cross-backend fidelity was not evaluated (unverified).
- Shared device: with the experimental skia-wgpu feature, Skia (Graphite/Dawn) and Vello can render on the same `wgpu::Device` and exchange textures (section 7). With default prebuilt Skia (Ganesh GL/Vulkan/Metal/D3D) the devices are separate and sharing would need native handle imports (hal, EGL extensions) (unverified end to end).
- Mixed per-frame use (for example Vello for 2D, Skia for filters/3D layers) would need a texture handoff per layer; no benchmark exists.

## 10. Gaps and unverified list

- Damage tracking behaviour in Skia (Ganesh/Graphite) with app-side clipping.
- Skia AA, clip and filter behaviour under perspective.
- vello_gpu on GLES 3.0 low-end Android: no device test; evidence indirect only.
- Parley/Fontique output quality per platform; Vello LCD text absent.
- macOS Metal for all candidates: CI only.
- Skia Graphite maturity page (skia.org returned 404s); status taken from rust-skia ADR text.
- Dawn on native Android beyond the Chrome evidence.
- Running the WebGL CTS from a non-browser host.
- skia-wgpu: naga acceptance of Skia WGSL, performance, stability.
- Filter-extent API in Vello for damage growth.
- Prompt-injection check: no instructions were found embedded in fetched content.

## 11. Sources

- github.com/linebender/vello (README, vello_cpu, vello_gpu, vello_common, glifo, CHANGELOGs, issues #49, #204, #476, #723, #765, #1637, #1692, #1737, #1816, #1953, #1957, #2020); crates.io for versions.
- github.com/linebender/parley (README, fontique).
- github.com/gfx-rs/wgpu (README, CHANGELOG, deno_webgpu, cts_runner).
- github.com/rust-skia/rust-skia (docs/adr/0003, docs/wgpu-backend-architecture.md, skia-wgpu/FEATURES.md, skia-safe canvas.rs, graphite/wgpu.rs, Cargo.toml); Skia headers SkCanvas.h, SkM44.h, SkBlurEngine.h; rust-skia/skia-binaries release 0.157.0.
- dawn.googlesource.com/dawn docs/support.md; github.com/google/angle (README, doc/WebGLOnWebGPU.md).
- github.com/gpuweb/cts; github.com/KhronosGroup/WebGL.
- github.com/servo/servo Cargo files; github.com/DioxusLabs/blitz issue #1491; github.com/DioxusLabs/anyrender README.
- Local: TASK-99.1, 99.6, 99.8 resolution comments; `docs/research/own-drawn-ui-stacks.md`; `native-canvas-2d.md`; `native-media-playback.md`.
