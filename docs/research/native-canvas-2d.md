# Canvas 2D on Skia (TASK-99.16)

Question: how closely does the HTML Canvas 2D API map onto skia-safe's `Canvas`/`Paint`/`Path`, where does it need extra work, how do existing projects structure the context object, and what follows for recording calls on a JS thread and replaying them on a UI thread? Facts and comparison only; no decision.

Date: 2026-11-07. skia-safe docs read: 0.157.0. skia-canvas source read: `main` (Cargo version 4.0.0).

## How to read this

- Every claim has a source in brackets. Sources are the WHATWG HTML spec (canvas chapter), Skia headers, skia-safe docs on docs.rs, and the source of skia-canvas, CanvasKit, node-canvas, Servo and Flutter.
- "Not verified" marks anything I did not confirm against a primary source in this pass. These are mostly the Canvas-to-Skia mapping rows that come from the spec plus the Skia API surface rather than from an implementation I read.
- Fetched web content was treated as data. No fetched page contained instructions aimed at an agent.

## Correction to the ticket's prior-art list

- node-canvas is not on Skia. Its `CanvasRenderingContext2d.cc` draws through a `cairo_t`, uses `cairo_image_surface_*`, `cairo_pdf_surface_*`, and FreeType glyph calls (`cairo_ft_font_face_create_for_ft_face`, `cairo_show_glyphs`); the file has no Skia headers or calls [node-canvas `src/CanvasRenderingContext2d.cc`]. It is therefore a Cairo comparison point, not a Skia one.
- The Skia-based projects that exist are CanvasKit (Skia's own JS/WASM build), skia-canvas (Rust, skia-safe, Node), and Flutter (Skia or Impeller behind its own display list).
- Servo's canvas is now Vello-based, not Skia: `components/canvas` contains `vello_backend.rs` and `vello_cpu_backend.rs` [servo `components/canvas` listing]. The `GenericDrawTarget` trait in `backend.rs` says its prototypes derive from "the now-removed Azure backend" [servo `backend.rs`].
- Blitz: the README does not mention `<canvas>` or a 2D context. It names `blitz-renderer-vello` and says `blitz-paint` translates a `blitz-dom` tree into `anyrender` draw commands [Blitz README]. I did not search Blitz's code or issues, so "Blitz has no canvas" is not established, only "the README is silent".

## Part 1: API mapping

Legend: **Direct** means one Skia call or object corresponds. **Composed** means several Skia pieces, still little logic. **Extra work** means the canvas semantics need code beyond a Skia call.

### Drawing state and save/restore

- The spec's drawing state saved by `save()` is: transform, clip, letter and word spacing, fill and stroke style, filter, global alpha, composite operation, shadow colour/offsets/blur, line width/cap/join/miter limit/dash list/offset, language, font, text align, baseline, direction, kerning, stretch, variant caps, text rendering, image smoothing enabled and quality. The current path and the bitmap are not part of it. `reset()` returns everything to defaults [HTML spec, canvas chapter, drawing state].
- Skia's `Canvas::save` stores only matrix and clip; `restore` discards matrix and clip changes and does nothing on an empty stack [skia-safe 0.157 `Canvas`]. A Skia `Paint` is a separate value the caller owns.
- Consequence: a canvas context must keep its own state stack alongside Skia's. All three implementations do this.
  - CanvasKit's JS context keeps `_canvasStateStack` with a copy of the transform, the paint, dash settings, shadow values, alpha, composite mode, and font string, and also calls `_canvas.save()` for the clip [`canvas2dcontext.js`].
  - skia-canvas has a `State` struct (clip, matrix, paint, fill and stroke `Dye`, shadow, dash, alpha, blend mode, filters, and about 20 font/text fields) and a `Vec<State>` stack [skia-canvas `src/context.rs`]. Its clip is held as a `Path` in state rather than only in Skia's save stack.
  - node-canvas keeps a JS-side `states` stack plus `cairo_save/restore` [node-canvas].
- The current path is deliberately outside the state stack in the spec, so it needs its own object (skia-canvas has `path: Path2D` on `Context2D`; CanvasKit uses a `PathBuilder`) [skia-canvas `context.rs`; `canvas2dcontext.js`].
- CanvasKit's `restore()` also applies the delta between the saved and current transform to the current path, because the spec stores path points in user space at the time of the call [`canvas2dcontext.js`].

### Paths and Path2D

- Path verbs: `moveTo`, `lineTo`, `bezierCurveTo`, `quadraticCurveTo`, `arc`, `arcTo`, `ellipse`, `rect`, `roundRect`, `closePath` all have Skia path equivalents. skia-canvas keeps one `Pen` trait with exactly these verbs, plus a non-standard `conicCurveTo`, implemented by both its `Path2D` and its context [skia-canvas `src/drawlist.rs`]. skia-canvas converts `arcTo`, `ellipse` and `arc` with its own methods that take `f64` angles [`drawlist.rs`].
- Skia builds and edits paths through `Path` and `PathBuilder`; skia-canvas imports `PathBuilder` and `path_utils::fill_path_with_paint` [`typography.rs`, `context.rs`]. Spec `Path2D` maps onto a Skia path object with its own transform-on-add (`addPath(path, matrix)`) (not verified against a Rust implementation in this pass).
- The spec says a canvas's current default path is transformed by each `setTransform` change in user space, not device space. This is the extra work CanvasKit does in `restore()` above.
- Fill rule per call: CanvasKit sets `FillType.EvenOdd` or `Winding` on a copy of the path before `clipPath` or `drawPath`; its `fill` throws on unknown rule strings [`canvas2dcontext.js`].
- `isPointInPath`/`isPointInStroke`: Skia path has `contains` for fill; stroke hit testing needs the stroked outline (`fill_path_with_paint`) (not verified).

### Fill, stroke, line styles

- A canvas fill is a Skia `Paint` with `PaintStyle::Fill`; stroke is `PaintStyle::Stroke` with width, cap, join, miter. CanvasKit's `_fillPaint()` copies `_paint`, sets the style and applies `globalAlpha`; `_strokePaint()` does the same and adds `PathEffect.MakeDash(list, offset)` when a dash list is set [`canvas2dcontext.js`].
- skia-canvas defaults its paint to anti-alias on, stroke width 1.0, miter 10.0, black, fill style [`context.rs`, `State::default`].
- `globalAlpha` is folded into the paint colour or shader alpha, not set as a separate property (CanvasKit uses `CanvasKit.multiplyByAlpha` for colours) [`canvas2dcontext.js`].
- skia-canvas goes beyond the spec with `lineDashMarker` and a dash fit mode, implemented with Skia's 1D path effect [`context.rs`, `paint_for_drawing`]. This is an extension, not canvas.

### Gradients and patterns

- Linear, radial and conic gradients map to Skia shaders; patterns map to image shaders with tile modes (not verified in implementation source in this pass; the shader assignment itself is visible in CanvasKit's `_fillPaint`, which "sets a shader" for gradients or patterns [`canvas2dcontext.js`]).
- Gradient and pattern objects must live as long as any saved state that references them; CanvasKit tracks them in `_toCleanUp` and frees them in `_dispose()` [`canvas2dcontext.js`]. In a Rust binding Skia objects are reference-counted, so this lifetime work may be handled by the wrapper type (not verified).
- skia-canvas supports gradient interpolation in sRGB, Oklab or Oklch, and CSS Color 4 colour syntax [skia-canvas README]. That is an extension over the base spec's colour handling.

### Transforms

- `translate`, `scale`, `rotate`, `transform`, `setTransform`, `resetTransform`, `getTransform` correspond to `Canvas::concat`, `set_matrix`, `reset_matrix` [skia-safe `Canvas`]. The canvas `transform(a,b,c,d,e,f)` is a 2D affine; skia-canvas passes nine-float arguments for `transform` and `setTransform` (`mat9`) [`drawlist.rs`].
- Spec filter and shadow geometry has a trap: "Filter coordinates are not affected by the current transformation matrix. The current transformation matrix affects only the input to the filter." [HTML spec, filters]. skia-canvas divides its shadow and blur sigma by the matrix scale (`blur / scale.x`) to compensate [`filter.rs`].
- Shadow offsets are in device space, not user space. CanvasKit's `_applyShadowOffsetMatrix()` undoes the CTM, translates, and reapplies; skia-canvas does `set_matrix(translate(offset))` then `concat(state.matrix)` [`canvas2dcontext.js`; `context.rs`].

### Clipping

- `clip()` maps to `Canvas::clip_path(path, ClipOp::Intersect, anti_alias)`; CanvasKit passes `true` for anti-alias [`canvas2dcontext.js`]. Skia's `Canvas` also has `clip_rect`, `clip_rrect`, `clip_region`, `clip_shader` [skia-safe `Canvas`].
- The spec's clip lives in the state stack. Skia's save/restore covers it, but skia-canvas additionally mirrors it in its own `State.clip` so that it can re-apply the clip when it replays layers [`context.rs`, `page.rs: set_clip`].

### globalCompositeOperation

- Skia has 29 `BlendMode` values: Clear, Src, Dst, SrcOver, DstOver, SrcIn, DstIn, SrcOut, DstOut, SrcATop, DstATop, Xor, Plus, Modulate, Screen, Overlay, Darken, Lighten, ColorDodge, ColorBurn, HardLight, SoftLight, Difference, Exclusion, Multiply, Hue, Saturation, Color, Luminosity. The header marks `kLastCoeffMode = kScreen` ("last porter duff blend mode") and `kLastSeparableMode = kMultiply` [Skia `SkBlendMode.h`].
- CanvasKit maps the string to `BlendMode` with `_paint.setBlendMode`, ignores unknown strings, and throws `'plus-darker is not supported'` [`canvas2dcontext.js`].
- Spec semantics differ from naive per-draw blending for the Porter-Duff modes that touch pixels outside the drawn shape (`copy`, `source-in`, `source-out`, `destination-in`, `destination-atop`): compositing applies "within the clipping region over the current output bitmap" [HTML spec, drawing model step 7]. skia-canvas handles this explicitly: for "region blend" modes it records the draw (including shadow) into an intermediate `Picture` bounded to the canvas, then draws that picture with the blend mode so the effect covers the whole canvas rather than only the shape's bounds [`context.rs` around the `is_region_blend` branch]. It also treats blend modes that sample the backdrop as "target dependent" [`context.rs`].
- Extra work: the whole-canvas behaviour for those operators, and a decision about modes with no Skia equivalent (`plus-darker`, `plus-lighter` mapping to `Plus`).

### Shadows

- Spec: shadows apply only when the shadow colour's alpha is non-zero and blur or an offset is non-zero. Steps: copy the alpha of the drawn image, offset it by the shadow offsets, blur with sigma equal to half `shadowBlur`, colourise, then composite below the shape [HTML spec, shadows 4.12.5.1.19].
- CanvasKit: `_shadowPaint()` returns null when alpha is zero or blur and both offsets are zero; otherwise it copies the base paint, sets the colour and adds a blur mask filter. `BlurRadiusToSigma(radius)` returns `radius/2`, "follows the spec rather than Blink's legacy formula" [`canvas2dcontext.js`].
- skia-canvas draws the shadow first as a separate pass with the shape (`render_shadow`) and then the shape itself, both inside the same `draw` closure [`context.rs`].
- Skia also has `Canvas::draw_shadow` for elevation (ambient/spot) shadows; that is a different effect from canvas shadows (it appears in the skia-safe `Canvas` method index; its description was past the section I read).

### Filters (`ctx.filter`)

- The spec property is a CSS filter-function string, default `"none"`, part of drawing state. It is applied to the shape before shadow and composite [HTML spec, drawing model step 4]. Unparseable values are ignored, leaving the current filter unchanged [HTML spec, filters].
- CanvasKit's context has no `filter` property [`canvas2dcontext.js`].
- skia-canvas supports "the full set of CSS filter image processing operators" [README]. Its `filter.rs` builds them from `image_filters::blur`, `image_filters::drop_shadow`, and `color_filters::matrix_row_major` / `table_argb` wrapped with `image_filters::color_filter` (brightness, contrast, grayscale, sepia, saturate, hue-rotate, etc.) [`filter.rs`].
- Extra work: a CSS filter-list parser, `url(#id)` SVG filter references (spec permits when the document is loaded), and the coordinate rule that filter geometry ignores the CTM.

### Text and measureText

- `fillText`/`strokeText`: CanvasKit builds a `TextBlob.MakeFromText(text, font)` from a single `Font` and draws it with the fill or stroke paint. Its `measureText` returns only `{ width }` computed from glyph ids and widths; `textAlign` and `textBaseline` are marked TODO; `maxWidth` is ignored [`canvas2dcontext.js`]. This is Skia's simple text path with no shaping or fallback.
- skia-canvas uses Skia's `textlayout` module (`ParagraphBuilder`, `Paragraph`, `FontCollection`), shapes and line-breaks into a `Paragraph`, then builds a `TextBlob` per run; it corrects `SkParagraph`'s baselines because they are rounded to whole pixels [`typography.rs` lines near `shape_text`, `line_info`].
- `TextMetrics` per spec has width, three actualBoundingBox values on x, six vertical values (font and actual ascent and descent, em height ascent and descent), and three baselines (hanging, alphabetic, ideographic) [HTML spec, TextMetrics].
- The spec's text preparation step also requires: replace ASCII whitespace with U+0020, resolve `font`, `direction`, `textAlign`, `textBaseline`, `fontKerning`, `letterSpacing`, `wordSpacing`, `fontVariantCaps`, `textRendering`, and `maxWidth` squeeze [HTML spec; the Servo implementation shows the whitespace step in `measure_text` comments].
- Servo computes `measure_text` on the script thread using its own `font_context`, with no round trip to the paint thread [servo `canvas_state.rs`].

### drawImage and ImageBitmap

- `drawImage` forms: 3, 5 or 9 arguments. CanvasKit maps them to `drawImageRect` with a copy of the fill paint so `globalAlpha` applies; any other argument count throws [`canvas2dcontext.js`]. Skia has `Canvas::draw_image` and `draw_image_rect` with sampling options [skia-safe `Canvas`].
- `imageSmoothingEnabled`/`imageSmoothingQuality`: CanvasKit's getters return fixed `true`/`'high'` and ignore setters [`canvas2dcontext.js`]. Skia exposes this through sampling options (filter and mipmap mode) (not verified).
- ImageBitmap: the spec gives ImageBitmap an origin-clean flag and a transfer mechanism; in a native renderer it corresponds to a decoded, immutable Skia `Image` plus metadata. This is a design mapping, not seen in any source I read.
- Source types beyond bitmaps (video frames, other canvases, OffscreenCanvas) must be snapshotted to an `Image`. skia-canvas treats other canvases as "page refs" that it resolves into cached images at playback [`page.rs: resolve`, `PageRef`].

### getImageData / putImageData

- Spec: getImageData converts pixels "from this's color space to imageData's colorSpace using 'relative-colorimetric' rendering intent"; pixels outside the canvas are transparent black; putImageData ignores `globalAlpha`, `globalCompositeOperation`, and shadows; premultiplied round-tripping is lossy [HTML spec, 4.12.5.1.16].
- CanvasKit's `getImageData` is `canvas.readPixels` with `RGBA_8888`, `Unpremul`, `SRGB`, returning null on failure. `putImageData` without a dirty rect uses `writePixels`; with one, it makes an image with `MakeImage` and draws it through `drawImageRect` after undoing the CTM [`canvas2dcontext.js`].
- Skia's `Canvas::read_pixels` ignores matrix and clip and works only when the canvas has readable pixels (raster) [skia-safe `Canvas`]. `Surface::readPixels` works for raster or Ganesh GPU surfaces; for Graphite it is deprecated in favour of an asynchronous context API [Skia `SkSurface.h`].
- The spec's `willReadFrequently` setting marks a context for readback optimisation; the spec says software canvases suit frequent `getImageData`, `toDataURL`, `toBlob` calls [HTML spec, context settings].

### toDataURL / toBlob / encoding

- CanvasKit's context has no `toDataURL` [`canvas2dcontext.js`]. In Skia this is `Image::encode` or `Surface` snapshot then encode, with PNG, JPEG, WebP encoders (not verified in this pass).
- skia-canvas `toBuffer` runs on a rayon pool (`rayon::spawn_fifo`) and settles a JS promise from the worker; it supports PNG, JPEG, WEBP, raw, PDF and SVG, plus a `density` option [`canvas.rs`; README].

### OffscreenCanvas

- Spec: `transferControlToOffscreen()` throws `InvalidStateError` unless the context mode is none; it creates an OffscreenCanvas sized to the canvas's attributes and puts the placeholder canvas in a state where it can no longer resize or get a context; its content updates in the OffscreenCanvas agent's update-the-rendering step [HTML spec, canvas chapter].
- Native mapping: an OffscreenCanvas is a context bound to an off-screen recording or surface, with no element and no layout. It is the simplest case for any recording design because it has no UI-thread presentation step (design observation, not from a source).

### Color spaces and pixel format

- Spec context settings: `colorSpace` default `"srgb"`, `colorType` default `"unorm8"` (or 16-bit float), `alpha` default true, `desynchronized` and `willReadFrequently` default false [HTML spec, context settings].
- skia-canvas supports `getContext("2d", {colorSpace:"display-p3"})` [README]. Its page recorder carries a `color_space`, builds layers with a colour space argument, and remaps gamut when replaying layers (`remap_gamut`) [`page.rs: begin_layer`, `playback_from`].
- `ImageData` carries its own colour space; getImageData converts from the context's space to it (see above).

## Part 2: Text via Parley vs Skia text

Facts only.

| | Skia text (`Font` + `TextBlob`, or `textlayout`) | Parley |
|---|---|---|
| Scope | Glyph runs and blobs are drawn by Skia. `textlayout` (SkParagraph) adds shaping, line breaking and paragraph layout inside Skia [skia-canvas `typography.rs`] | "computes where each glyph goes, including line breaking and bidirectional text resolution"; no rendering [Parley README] |
| Shaping | via SkParagraph's own shaper in the skia-safe `textlayout` module (not verified which shaper skia-safe links) | HarfRust (Rust HarfBuzz port); ICU4X for bidi, segmentation, normalisation [Parley README] |
| Font fallback | SkParagraph `FontCollection` (skia-canvas uses it) | Fontique enumerates fonts and picks fallback [Parley README] |
| Drawing glyphs | `Canvas::draw_text_blob` with a `TextBlob`; skia-canvas builds one blob per run [`typography.rs`] | Output is positioned glyph runs; the app must turn them into Skia glyph runs itself (Skrifa gives outlines and metrics) [Parley README] |
| Metrics | skia-canvas computes per-line baselines manually because SkParagraph rounds them [`typography.rs`] | README does not describe a measurement API beyond layout; Skrifa provides higher-level metrics [Parley README] |
| Maturity signal | Used by skia-canvas v4 for full canvas text, multi-line wrap, variable fonts, OpenType features [README] | Tested against Web Platform Tests through Blitz's runner; MSRV 1.88; stability level not stated [Parley README] |

- The text stack also decides what UI text uses. TASK-99.3 already records HarfRust with Parley and Fontique as the most complete reusable stack (parent TASK-99). If UI text is Parley and canvas text is SkParagraph, there are two shaping stacks with potentially different metrics; this ticket only notes the fact, no choice.
- Not found in any source read: an existing project that draws `<canvas>` text through Parley into Skia.

## Part 3: GPU vs raster backing and readback

- A canvas with a CPU raster surface has pixels directly readable. `Canvas::read_pixels` works "only when the canvas is backed by readable pixels, such as a raster surface" [skia-safe `Canvas`].
- `Surface::readPixels`: "readable when SkSurface is raster, or backed by a Ganesh GPU backend"; Graphite deprecates it in favour of an async API [Skia `SkSurface.h`].
- `asyncRescaleAndReadPixels`: "only supported in the Ganesh GPU backend and only when the underlying 3D API supports transfer buffers and synchronization primitives. In all other cases this operates synchronously." On GPU "this flushes work but a submit must occur to guarantee a finite time before the callback is called" [Skia `SkSurface.h`].
- The HTML spec's `willReadFrequently` hint exists because GPU readback is the slow path [HTML spec, context settings].
- skia-canvas readback design, from source: `getImageData` rasterises the page into a dedicated `ReadbackSurface` cached per page; the surface keeps a `PageVersion` and reuses it if the new page version "extends" it; it is recreated if the GPU/CPU choice toggles or the size changes. On the GPU path the read always runs on a single render thread that owns the `DirectContext` and the JS thread blocks on a channel for the result; the CPU path runs inline on the shared cache. `read_frequently` is passed into the readback cache [`page.rs: write_pixels`; `gfx/cache/readback.rs`; `gfx/engine.rs: render_thread::run`].
- skia-canvas' GPU backends are feature-gated: `metal` and `vulkan` features pull in `skia-safe/metal`/`ganesh` and `skia-safe/vulkan`/`ganesh` [skia-canvas `Cargo.toml`]. Its docs call Skia "GPU-accelerated" but I found no published default for GPU vs CPU [README].
- CanvasKit offers separate surface constructors for software, WebGL and GPU surfaces (names from memory; the skia.org CanvasKit page only says it provides a "WebGL context encapsulated as an SkSurface" [skia.org CanvasKit]).
- Numbers for readback cost were not found in a primary source. No benchmark is cited here.

## Part 4: High DPI

- The spec's bitmap size is the `width`/`height` attributes; CSS size is separate. Applying device pixel ratio is a page-level convention (author scales attributes and transform), not something the 2D context does. (Spec chapter; no specific quote retrieved in this pass.)
- skia-canvas exposes density at export and read: `toFile(..., {density:2})` and a `density` option on `getImageData` [README]. Its `Page::scaled_dimensions(density)` computes the pixel size from logical size [`page.rs`].
- Consequence for a native renderer: the element's layout size (CSS px) and backing size (device px) must both be tracked; a recorded op list stays in logical units, and the replay matrix carries the scale (consistent with skia-canvas' replay-with-matrix design, `playback_from(canvas, first, matrix, replay)`).

## Part 5: How other projects structure the context object

### CanvasKit (`modules/canvaskit/htmlcanvas/canvas2dcontext.js`)

- A JS class holds one `CanvasKit.Paint`, a default `Font`, a `PathBuilder` for the current path, an identity CTM, and a `_canvasStateStack`. Properties are `Object.defineProperty` getters and setters.
- Each draw call creates a derived paint (`_fillPaint`, `_strokePaint`, `_shadowPaint`) and immediately issues Skia calls on the real `SkCanvas`. There is no recording layer inside the context. The `Canvas` is whatever surface CanvasKit was given (an SkSurface over WebGL, GPU or software) [`canvas2dcontext.js`].
- Documented gaps (from the file): no `filter`, no `toDataURL`, text align and baseline TODO, `maxWidth` ignored, smoothing setters ignored, hit-region functions are no-ops, `plus-darker` throws [`canvas2dcontext.js`]. skia.org describes CanvasKit as a Skia API binding and playground, not a complete Canvas 2D implementation [skia.org CanvasKit].

### skia-canvas (Rust, `src/`)

- `Context2D { bounds, recorder: RefCell<PageRecorder>, state, stack: Vec<State>, path }`. The JS side accumulates ops as `[opcode, args...]` records in a `Float64Array` and passes the whole buffer to Rust "when it's time to draw"; Rust decodes opcodes into trait calls (`Pen` for shared path verbs, `Plotter: Pen` for context-only verbs) [`context.rs`; `drawlist.rs`].
- Drawing goes into a `PageRecorder` that wraps Skia `PictureRecorder`s; a `Page` holds a layered set of `Picture`s. Layers get isolated with `saveLayer` when composited; pages can reference other pages, resolved to cached images at playback [`page.rs`].
- Execution is on different threads per operation: export (`toBuffer`) goes to a rayon pool and returns a Promise; GPU rasterisation and GPU readback go to one dedicated render thread that owns the `DirectContext`, driven by an `mpsc` channel with `run` (blocking, returns result) and `post` (fire and forget, e.g. freeing GPU objects on the owning thread) [`canvas.rs`; `gfx/engine.rs`].
- `measureText` is answered synchronously on the calling thread, memoised by a key of font state plus text (`cached_metrics(self.state.metrics_key(...))`), using a `Typesetter` that builds a Paragraph [`context.rs: measure_text`].
- `ImageData` read is the blocking path described in Part 3.

### node-canvas

- Cairo context (`cairo_t`) directly; JS-side `states` stack for non-Cairo state; text uses its own layout step and FreeType through Cairo [node-canvas source]. Calls are immediate, on the calling thread.

### Servo (`components/canvas`)

- The script thread owns the DOM context state and sends commands to a `CanvasPaintThread`: a dedicated thread spawned with `thread::Builder`, looping on an IPC receiver and calling `process_command(command, canvas_id)` [servo `canvas_paint_thread.rs`]. Commands include `DrawImage`, `PutImageData`, and `GetImageData(rect, sender)`.
- `GetImageData` is a request/response: the script thread builds a channel, sends the command with the sender, and blocks on `receiver.recv()`; the paint thread replies with `read_pixels(rect)` as a shared snapshot [servo `canvas_state.rs`, `canvas_paint_thread.rs`].
- State lives on the script side. The paint-thread-side `canvas_data.rs` "keeps no graphics-state stack"; transforms, composition options and shadow options "arrive as per-call parameters"; only clips are stateful there (`push_clip`, `pop_clips(n)`) [servo `canvas_data.rs`].
- Text is shaped on the script thread; the paint thread receives `TextRun`s with bounds (`fill_text`, `stroke_text` take them); `measure_text` uses the script thread's `font_context` [servo `canvas_data.rs`; `canvas_state.rs`].
- The drawing backend sits behind `GenericDrawTarget` with Vello and Vello-CPU implementations [servo `backend.rs`, file listing].

### Flutter

- `dart:ui` `Canvas` is constructed from a `PictureRecorder`; "Passing it to the `Canvas` constructor associates the two and begins recording"; `endRecording()` returns a `Picture` [Flutter API docs, `PictureRecorder`]. In the engine, `Canvas` holds a `DisplayListBuilder` and forwards calls such as `Save()` and `DrawRect(...)`; `Invalidate()` nulls it so later calls are no-ops [flutter/engine `lib/ui/painting/canvas.cc`].
- A `DisplayList` is built by a `DisplayListBuilder` and "can be rendered to Skia using a `DlSkCanvasDispatcher`" [flutter/engine `display_list/display_list.h`]. The Flutter docs I fetched did not state which thread rasterises, and did not discuss `toImageSync`.
- Flutter has no Canvas 2D stateful context API of this canvas type (no current path, no state stack of paint properties); `Paint` is passed per call. It is a recording precedent for Skia-targeted drawing, not an API-shape precedent.

### Comparison summary

| Project | Backend | State stack lives in | Draw model | Reads |
|---|---|---|---|---|
| CanvasKit | Skia | JS context | Immediate on `SkCanvas` | `readPixels` on the same canvas |
| skia-canvas | Skia (skia-safe) | Rust `Context2D` | Op buffer from JS, recorded into `PictureRecorder` layers, replayed at export or read | Blocking cross-thread call to render thread (GPU) or inline (CPU); metrics sync and memoised |
| node-canvas | Cairo | JS and Cairo | Immediate | Direct |
| Servo | Vello / Vello-CPU | Script thread (paint thread stateless but for clips) | Commands over IPC to a paint thread | Blocking request/response channel |
| Flutter | Skia/Impeller | Per-call `Paint`, no context state | `PictureRecorder` / `DisplayList` | (not covered) |

## Part 6: Recording on a JS thread and replaying on a UI thread

Facts from the sources above, plus the constraint structure they imply.

- Skia's recording primitive is `PictureRecorder` producing a `Picture`: "SkPicture records drawing commands made to SkCanvas. The command stream may be played in whole or in part at a later time." The header does not state thread-safety rules; it notes only that a placeholder picture is immutable. Picture has a cull rect that is a hint, not a clip, and the picture "is free to discard recorded drawing commands that fall outside cull" [Skia `SkPicture.h`]. I did not find a primary source stating a `Send` implementation for skia-safe's `Picture` (the docs.rs page URL I tried returned 404), so cross-thread handoff of a `Picture` in Rust is not verified here. skia-canvas does hold `Picture`s inside structures it sends to rayon and the render thread, which is circumstantial evidence only [`page.rs`, `canvas.rs`].
- skia-canvas and Flutter both split recording from replay; Servo splits state from execution across an IPC channel. In all three the write side is asynchronous and the read side that needs pixels blocks.
- Calls that return data and so must either block or be answered from JS-side state:
  - `measureText`: needs only fonts and state, not pixels. skia-canvas and Servo both answer it on the thread that owns the context (script or JS thread) without crossing to the paint thread [`context.rs: measure_text`; servo `canvas_state.rs`]. The cost is that the JS thread needs access to the font and shaping stack that UI text also uses.
  - `getImageData`: needs the rendered pixels, so everything recorded before it must be replayed first. skia-canvas does this by rasterising the recorded page in a readback surface and blocking the caller on a channel; for GPU it blocks on the render thread [`page.rs`; `gfx/engine.rs`]. Servo blocks on `recv()` over an IPC channel [servo `canvas_state.rs`].
  - `isPointInPath`, `isPointInStroke`, `getTransform`, `getLineDash`, property getters: depend only on JS-side state and path geometry, so need no UI-thread round trip if the context keeps them (skia-canvas keeps all of it in `Context2D`; not verified for hit testing).
  - `toDataURL`, `toBlob`: pixel reads; `toBlob` is already asynchronous in the spec, `toDataURL` is synchronous (spec; not re-quoted here). skia-canvas exposes async `toBuffer` on a worker pool [`canvas.rs`].
  - `drawImage` from another canvas or video frame: needs a snapshot of the source at call time; skia-canvas resolves page references at playback time ("page refs") [`page.rs`].
- State that must be mirrored on the JS side to answer reads without a UI round trip: the transform, clip (for `isPointInPath`), path, font (for `measureText`), plus the entire state list in the spec. All three implementations keep this in the thread that runs the script.
- Resource ownership constraint: skia-canvas runs GPU object creation and deletion on the single thread that owns the `DirectContext`, and posts deallocations to it with `render_thread::post`; GPU readbacks run in `render_thread::run` [`gfx/engine.rs`]. Skia's GPU contexts being single-thread-owned is the reason (the Skia header text I fetched says `asyncRescaleAndReadPixels`'s result is invalidated "if the context is abandoned or destroyed" [`SkSurface.h`]; the general single-thread rule is not quoted from a source here).
- Re-entrancy: skia-canvas' `run` detects when it is already on the render thread and runs the closure inline to avoid deadlock [`gfx/engine.rs`].
- Back pressure and frame model: a recorded canvas whose consumer is the UI thread's next frame has no equivalent in the sources read; the spec model is that canvas content is part of the "update the rendering" step of its agent (stated for OffscreenCanvas placeholders) [HTML spec, `transferControlToOffscreen`].
- Memory accounting: skia-canvas assigns budgets and eviction for readback surfaces and rasters (`budget.rs`, `rasters.rs`, `readback.rs` in `gfx/cache`); Servo reports memory per type (`canvas_store_sizes`) [skia-canvas tree; servo `backend.rs`].

## Open items not resolved here

- Whether skia-safe's `Picture` and `Image` are `Send` (and under what features); needs a check against the crate's source or docs.
- A primary source for GPU readback cost numbers.
- Which shaper skia-safe's `textlayout` module links and whether it matches HarfRust output; whether there is any Parley-to-Skia glyph drawing example outside the repo's own research.
- Pattern, gradient, and `Path2D`-hit-testing mappings, which I stated from the Skia API surface and did not confirm in an implementation.
- Whether Blitz or AnyRender has any canvas work (README is silent).
- Exact skia-canvas default for GPU vs CPU.
- `ImageBitmap` and `OffscreenCanvas` transfer semantics in a non-browser host; the spec text was read only at the level quoted above.

## Sources

- WHATWG HTML Standard, canvas chapter: https://html.spec.whatwg.org/multipage/canvas.html (read in two ranges; the first 100000 and 230000 to 330000 characters; text preparation and measureText algorithm steps were in unread ranges).
- skia-safe 0.157.0 `Canvas`: https://docs.rs/skia-safe/latest/skia_safe/struct.Canvas.html (first 100000 characters).
- Skia headers: `include/core/SkSurface.h`, `include/core/SkPicture.h`, `include/core/SkBlendMode.h` at https://raw.githubusercontent.com/google/skia/main/.
- CanvasKit Canvas2D: https://raw.githubusercontent.com/google/skia/main/modules/canvaskit/htmlcanvas/canvas2dcontext.js and https://skia.org/docs/user/modules/canvaskit/.
- skia-canvas: README, `Cargo.toml`, `src/{canvas,context,drawlist,filter,typography}.rs`, `src/gfx/{engine,page}.rs`, `src/gfx/cache/{mod,readback}.rs` at https://github.com/samizdatco/skia-canvas (main).
- node-canvas: https://raw.githubusercontent.com/Automattic/node-canvas/master/src/CanvasRenderingContext2d.cc.
- Servo: `components/canvas/{backend,canvas_data,canvas_paint_thread}.rs`, `components/shared/canvas/canvas.rs`, `components/script/dom/canvas/2d/canvas_state.rs` at https://github.com/servo/servo (main).
- Flutter: https://api.flutter.dev/flutter/dart-ui/PictureRecorder-class.html; `lib/ui/painting/canvas.cc` and `display_list/display_list.h` in flutter/engine (main).
- Parley: https://raw.githubusercontent.com/linebender/parley/main/README.md.
- Blitz: https://github.com/DioxusLabs/blitz.
