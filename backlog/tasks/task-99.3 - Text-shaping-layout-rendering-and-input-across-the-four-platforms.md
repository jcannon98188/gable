---
id: TASK-99.3
title: Text shaping, layout, rendering and input across the four platforms
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T21:37:00Z'
updated_date: '2026-11-07T21:41:00Z'
labels:
  - wayfinder:research
dependencies: []
parent_task_id: TASK-99
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What does an own-drawn renderer need for production text on Windows, macOS, Linux and Android: shaping and line breaking (HarfBuzz, cosmic-text, others), font fallback, rich text, text editing, IME and composition, clipboard, and platform differences (including macOS specifics)? Which components are reusable and which parts must be built per platform? Facts and a comparison, not a decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T21:41:00Z

---

Research resolved. Findings on branch `research/native-text-and-input` (docs/research/native-text-and-input.md). Shaping: HarfRust (successor to the archived rustybuzz). Reusable stacks: Parley with Fontique has system font backends for DirectWrite, Core Text, fontconfig and Android, and an IME-aware editor; cosmic-text claims full features only on Linux, macOS and Windows and lacks copy/paste; ICU4X for line breaking. The Android NDK has no layout or shaping API. IME needs a per-platform bridge with differing index units (TSF, NSTextInputClient, Wayland text-input-v3 with UTF-8 byte offsets, Android InputConnection with UTF-16); winit Ime events give a cross-platform abstraction, and NativeActivity has no real IME while GameActivity does. Clipboard: arboard is desktop only, Wayland needs the source app alive, Android needs input focus. Gaps: macOS clipboard and Core Text range units, TSF details, X11 IME, Fontique Android fallback, rich-text clipboard, Retina and Metal text rendering all unverified.

---
<!-- COMMENTS:END -->
