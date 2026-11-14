---
id: TASK-99.22
title: Prototype spike and checkpoint for the owned renderer stack
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T23:33:00Z'
updated_date: '2026-11-08T01:55:00Z'
labels:
  - wayfinder:prototype
dependencies:
  - TASK-99.21
parent_task_id: TASK-99
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Build the thinnest throwaway vertical slice that proves the chosen stack and answers the checkpoint in ADR 0005: Rust host with winit, the engine interface (adopted interim engine), Taffy layout, Parley text, the owned wgpu compositor with vello_gpu and vello_cpu path rasterization (plus a lyon fallback spike of the seam), one Android build. It must measure: text quality against Chromium, low-end Android GPU behaviour on Vulkan and GLES, macOS Metal through CI, blur and backdrop reads at frame rate, perspective with correct picking, Stylo build size, build time, Python build dependency and MPL-2.0 implications, winit Android IME and HiDPI versions, and AccessKit announcements. Output: a report against named pass criteria, for the maintainer to decide whether to continue or adopt Skia as the v1 renderer.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-08T01:51:00Z

---

Spike done on branch prototype/native-renderer-spike (pushed, no PR). Report: docs/research/native-renderer-spike-report.md. PASS: P1 (1px baseline caveat), P2 desktop (1.70ms avg at 1080p), P3, P4, P5, P6 build, P7, P8 Vulkan, P9 partial, P10 source-only. FAIL: P8 GLES present (black screen on emulator, undiagnosed). NOT MEASURED: P2 on physical device (emulator is software GPU, 38-46ms), arm64 run, macOS Metal (workflow written, not triggered), spoken AccessKit announcement, runtime IME, Stylo size delta. Disclosure: maintainer AVD was rebooted once and dev.gable.spike remains installed on it (lock credential not bypassed); measured runs used a scratch AVD, deleted. Not set Done; checkpoint decision is the maintainer's.

---

author: @jason
created: 2026-11-08T01:55:00Z

---

## Checkpoint decision

The maintainer chose to **continue with the owned hybrid renderer on wgpu** (ADR 0005); Skia is not adopted as the v1 renderer. The display-list boundary stays renderer-neutral as the safety valve.

Spike results (branch `prototype/native-renderer-spike`, report `docs/research/native-renderer-spike-report.md` on that branch):

- Pass: text vs Edge (mean diff 5.4/255 at 1x, 2.1/255 at 2x; baseline about 1px low at 1x; no LCD antialiasing); blur and backdrop blur on desktop (1080p averages 1.70 ms, p99 1.88 ms); perspective picking (13 cases, 0 failures, including nested clips); mask, blend and opacity group with no panics; path seam (vello_cpu vs vello_gpu 0.010/255, lyon differs by more than 32/255 on 0.15% of pixels); Stylo builds on Windows (about 49 s, needs Python on PATH); release exe 11.4 MB, cold build 95 s, spike crates include no MPL-2.0 (Stylo probe graph does); aarch64 build with NDK 27 and GameActivity app; Android Vulkan renders correctly.
- Open: Android GLES 3.0 ran 300 frames but the screen stayed black (cause unknown); the GLES floor is unproven.
- Partial: AccessKit UI Automation saw text and focus changes, but the LiveRegionChanged event and spoken announcements were not observed; winit 0.31.0-beta.4 on Android has no IME events (use android-activity GameTextInput) and its scale-change handler looks inverted (source reading only).
- Not measured: macOS Metal (workflow written, manual trigger, never run); real Mali or Adreno frame times (emulator GPU is software); Stylo binary size delta; aarch64 `.so` never executed; QuickJS stub skipped. P1 and P5 thresholds were chosen after the first runs.
- Not built: damage tracking, scrolling, preserve-3d depth sorting; blending is in gamma space.

Follow-ups filed as tickets: Android GLES black screen, macOS Metal CI run.

---
<!-- COMMENTS:END -->
