---
kind: ticket
title: Layout engines, windowing and the app shell
status: resolved
type: research
tags:
  - parent-99
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-99.5 - Layout-engines-windowing-and-the-app-shell.md
assignee:
  - '@jason'
ordinal: 191000
---

## Question

Which layout engines (Taffy, Yoga, own) and windowing and shell layers (winit, SDL, GLFW, Android NativeActivity or GameActivity, direct platform code) fit an own-drawn renderer on Windows, macOS, Linux and Android? For each: layout model supported (flexbox, grid, block, intrinsic sizing), scrolling and hit testing, high-DPI, multi-window, mobile lifecycle, input devices, and macOS specifics (menu bar, Cmd key, Retina). Facts and a comparison, not a decision.

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T21:40:00Z

---

Research resolved (docs-level, nothing run). Findings on branch `research/native-layout-and-shell` (docs/research/native-layout-and-shell.md). Taffy 0.15.1 covers Block, Flexbox and Grid with measure closures for text, but scrolling, clipping and hit testing are ours. Yoga is flexbox only. winit 0.30.13 covers Windows, macOS, X11, Wayland and Android but has no native menus (the muda crate supplies them), no touch on macOS, and contradictory Android IME and HiDPI docs that need source verification. SDL3 covers all four platforms (Android via a Java SDLActivity shim) with a text-input API. GLFW is desktop only. GameActivity brings IME where NativeActivity does not. Gaps: direct per-platform code (Win32, AppKit, JNI) not surveyed; SDL3 Cmd-key and macOS menu behaviour and Yoga details unverified.

---
<!-- COMMENTS:END -->
