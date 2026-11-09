---
id: TASK-99.17
title: Media and canvas design for Gable Native
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:48:00Z'
updated_date: '2026-11-07T23:10:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.15
  - TASK-99.16
parent_task_id: TASK-99
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide how video, audio, track, source and canvas work in Gable Native: the media backend per platform (platform decoders versus a bundled library), codec and streaming coverage, how video frames reach the Skia surface, captions and the HTMLMediaElement surface, where it sits (vocabulary, Platform service or both), and the canvas 2D context design: the context as a host class, command recording on the JS thread and replay on the UI thread, blocking reads (measureText, getImageData), GPU or raster backing, OffscreenCanvas and Path2D scope. Must satisfy the macOS constraint.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T22:54:00Z

---

User preference, stated before the grilling: canvas 2D should be GPU-backed wherever possible, including for the canvas API. Research (branch research/native-canvas-2d) notes that async pixel readback exists only on Skia's Ganesh GPU backend and getImageData is otherwise synchronous, so the design must cover readback cost, a raster fallback (for example a willReadFrequently-style hint or unsupported GPUs), and the Ganesh versus Graphite choice.

---

author: @jason
created: 2026-11-07T23:10:00Z

---

Resolved with the user. Element methods: a template ref on native resolves to a lazily created JS-side element facade (a host class instance wrapping the node handle) exposing the element's documented properties and methods (video.play(), canvas.getContext('2d'), input.focus(), select(), showModal(), scrollIntoView() via Geometry), each documented as queued into the flush's command buffer or an explicit blocking read; the Renderer node type stays opaque and the DOM renderer returns the real element; the language service types facades from the renderer's element map. Media backend: each platform's own decoder stack behind a Gable-owned MediaBackend seam (Media Foundation on Windows, AVFoundation on macOS, GStreamer on Linux as a runtime dependency, Media3 ExoPlayer through JNI on Android); no bundled FFmpeg (a bundled build can be an opt-in custom host build later); missing GStreamer yields the standard media error event with a clear message; no mature pure-Rust H.264 High, HEVC or VP9 decoder exists. Video frames: a video is a replaced element drawn as an external image in the display list, with the backend producing frames on its own thread and the painter sampling the latest frame at paint time; the seam is designed for GPU zero-copy; the first implementation is CPU copy and texture upload, with zero-copy per platform as measured follow-ups (Android AHardwareBuffer first, then Windows D3D11 shared surface and macOS CVPixelBuffer through Metal). HTMLMediaElement: one shared host implementation synthesises the state machine (readyState, networkState and the standard events) over a small MediaBackend trait (load, play, pause, seek, rate, volume, track selection) so behaviour is identical on all platforms; standard properties and methods through the element facade; the controls attribute draws Gable-owned, themeable and accessible default controls. Tracks and streaming: Gable parses WebVTT itself and draws cues with basic ::cue styling and a textTracks subset (mode, cues, cuechange); HLS, DASH and progressive work where the backend supports them with a documented matrix (Windows HLS and DASH support is unconfirmed and a prototype item); DRM is out of v1; audio output and A/V sync belong to the backend with no Gable mixer and no Web Audio API; media sessions (media keys, Now Playing, Android audio focus) are a later Token. Canvas: getContext('2d') returns a host class instance on the JS thread that owns the spec state stack and current path; drawing calls record into a Skia picture or op buffer handed to the UI thread at the frame boundary and replayed into the canvas's backing surface; the backing surface is GPU-first (a GPU texture on the renderer's shared GPU context, composited without a copy), the canvas follows the renderer's GPU backend (assumed Ganesh for now because Graphite deprecates synchronous readback), getContext('2d', { willReadFrequently: true }) creates a CPU-backed canvas and canvases fall back to raster without a GPU; measureText is answered on the JS thread from the shared Parley font system; getImageData, toBlob and toDataURL block the JS thread while the UI thread replays and reads back; whether skia-safe Picture and Image are Send is unverified and a prototype item. Canvas scope v1: paths and Path2D, fills and strokes, gradients and patterns, transforms, clipping, compositing and blend modes, shadows, the filter property via Skia image filters, text drawn with Parley layout and Skia glyph drawing so canvas text matches UI text, drawImage from img, canvas, video and ImageBitmap, createImageBitmap, getImageData, putImageData, toDataURL, toBlob, OffscreenCanvas in the main realm only; bitmap size is the width and height attributes scaled by layout as on the web; canvas children are not drawn but exposed to accessibility as fallback content. Out of v1: WebGL and WebGPU contexts (names getContext('webgpu') and getContext('webgl2') are reserved), hit regions, drawFocusIfNeeded, captureStream and Workers. The user wants WebGPU and WebGL eventually, possibly all driven by wgpu, and asked to revisit Skia versus Vello and whether Vello could serve canvas alone: spawned the research ticket Vello and wgpu against Gable Native's rendering requirements, whose result may reopen the Skia choice in the Architecture ticket. macOS: media uses AVFoundation, verifiable only through CI, and the GPU path is Metal.

---
<!-- COMMENTS:END -->
