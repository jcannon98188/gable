---
kind: ticket
title: Canvas 2D on Skia
status: resolved
type: research
tags:
  - parent-99
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-99.16 - Canvas-2D-on-Skia.md
ordinal: 213000
---

## Question

Gable Native v1 includes the canvas element with a 2D context mapped onto Skia. How closely does the HTML Canvas 2D API (paths, fills and strokes, gradients and patterns, transforms, clipping, compositing and blend modes, shadows, filters, text with measureText, images, getImageData and putImageData, toDataURL and toBlob, OffscreenCanvas, Path2D, ImageBitmap) map onto skia-safe's SkCanvas, and where does it not (state stack, text via Parley versus Skia text, color spaces, pixel readback cost on the GPU, GPU versus raster backing, high-DPI)? How do existing projects (Skia CanvasKit, node-canvas on Skia, skia-canvas, Blitz or Servo canvas work, Flutter) structure the context object, and what does that mean for recording calls on the JS thread and replaying on the UI thread? Facts and comparison only, no decision.

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T22:52:00Z

---

Resolved. Findings on branch research/native-canvas-2d (docs/research/native-canvas-2d.md). Key facts: node-canvas is Cairo, not Skia, and Servo's canvas is Vello-based, so the Skia comparison points are CanvasKit, skia-canvas and Flutter. Skia save/restore holds only matrix and clip, so every implementation keeps its own spec state stack plus a separate current path. Spec filters, region-wide Porter-Duff blends, device-space shadows and the CTM-independent filter coordinates need extra work (skia-canvas builds filters from Skia image/color filters and uses an intermediate Picture for region blends); CanvasKit lacks filter, toDataURL and most text features. Text: skia-canvas uses Skia's textlayout Paragraph; Parley does layout only (HarfRust, Fontique), so glyph drawing into Skia is ours; no existing project found doing Parley into Skia for canvas. Readback: Skia readPixels works on raster and Ganesh surfaces, async reads only on Ganesh with transfer buffers; skia-canvas caches a readback surface per page and blocks the caller on a render thread. Structure: skia-canvas records an op buffer into PictureRecorder layers and replays on a render thread; Servo keeps state on the script thread and blocks on a channel for getImageData; measureText is answered on the context-owning thread in both. Open items: skia-safe Picture Send status, GPU readback numbers, Blitz canvas status. Fetched web content contained no embedded instructions.

---
<!-- COMMENTS:END -->
