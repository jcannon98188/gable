---
id: TASK-99.6
title: Architecture and host language
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T21:37:00Z'
updated_date: '2026-11-07T23:33:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.1
  - TASK-99.2
parent_task_id: TASK-99
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Given the research, where does Gable TypeScript run, what language is the native host written in, and how do they communicate? Decide the engine choice, host language, rendering stack, process and thread model (JS thread, render thread, layout), the batching of Renderer operations across the boundary, and the packaging unit. Confirm or overturn the own-drawn working direction, and check every choice against the macOS constraint.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:02:00Z

---

Resolved with the user. Host language: Rust. Rendering: Skia (skia-safe) behind an internal display-list boundary so Vello can replace it later; Parley (text), Taffy (layout) and AccessKit (accessibility) adopted behind Gable-owned seams; whole toolkits (Slint, Flutter, egui, iced and others) rejected because Gable owns the component model, event loop and template runtime. Windowing: winit plus muda (native menus, macOS menu bar) on desktop, GameActivity via android-activity on Android (IME and AccessKit); winit Android IME and HiDPI docs contradict themselves, so the chosen version needs verifying in a prototype. Threads: one process, a JS thread and a main UI thread (macOS requires AppKit on main); the retained node tree, styles and layout live in Rust and JS holds integer handles; Renderer operations are batched into one command buffer per core flush; rare synchronous reads are explicit blocking calls, which the Renderer seam ticket decides. Packaging: a prebuilt host runtime per platform plus an app bundle (dev loads from the Vite dev server, production embeds the bundle), custom host builds possible, Android as a native library in an APK with a thin GameActivity shim. JS engine: Gable owns its engine, written in Rust, behind an engine interface (user choice over adopting QuickJS-NG or Boa); an adopted engine (QuickJS-NG first, Boa as the pure-Rust alternative) runs in the interim until the Gable engine passes a test262 gate. Principle: own the seams and the Gable-specific parts, adopt commodity layers behind them, and the JS engine is the single stated exception. The implementation of the engine is a later effort. Spawned: research on engine design prior art and test262, and a grilling ticket for the Gable JS engine design. macOS: every choice above has a macOS path (Metal via Skia, muda, AccessKit macOS adapter, winit macOS, pure-Rust engine).

---

author: @jason
created: 2026-11-07T23:33:00Z

---

Amended by the renderer hybrid ticket (docs/adr/0005): the rendering choice 'Skia (skia-safe) behind an internal display-list boundary so Vello can replace it later' is superseded by an owned hybrid renderer on wgpu (owned compositor and UI primitives, adopted vello_gpu and vello_cpu path rasterization), with the display-list boundary kept renderer-neutral so Skia remains a fallback if the prototype checkpoint fails. All other decisions here stand.

---
<!-- COMMENTS:END -->
