---
kind: ticket
title: Own-drawn UI stacks across Windows, macOS, Linux and Android
status: resolved
type: research
tags:
  - parent-99
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-99.1 - Own-drawn-UI-stacks-across-Windows-macOS-Linux-and-Android.md
assignee:
  - '@jason'
ordinal: 187000
---

## Question

Which existing rendering stacks could Gable Native build on (Skia/skia-safe, Vello with wgpu, the Flutter engine embedder, Slint, and any others found)? For each: Windows, macOS (Metal), Linux and Android support, maturity, licensing, binary size, text and accessibility story, and how it embeds in a custom host. Output facts and a comparison, not a decision. macOS must have a real implementation (see map Notes).

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T21:41:00Z

---

Research resolved. Findings on branch `research/own-drawn-ui-stacks` (docs/research/own-drawn-ui-stacks.md). The candidates sit at different layers: Skia/skia-safe 0.157 (prebuilt for Windows, macOS/Metal, Linux, Android API 26+; no a11y of its own) and Vello 0.11 (CPU mature, GPU maturing, compute experimental; via wgpu, Metal first-class) are 2D renderers; Parley and AccessKit are building blocks (AccessKit adapters for Windows, macOS, Linux, Android at rough parity, no rich text); Slint 1.18 is a stable full toolkit on all four platforms but GPLv3, royalty-free-with-attribution or commercial, with its own component model and event loop; the Flutter embedder has a stable C ABI and Metal/Vulkan but runs Dart and custom engine builds are unsupported; egui, iced, Xilem, GPUI, Blitz and Compose Multiplatform each have maturity, platform or accessibility gaps. Gaps: no binary-size figures, text and IME docs for Skia, Flutter and Slint unreached, Android status of Vello, Xilem, GPUI and iced unstated.

---
<!-- COMMENTS:END -->
