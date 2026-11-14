---
id: TASK-99.24
title: Find the Android GLES 3.0 black screen in the renderer spike
status: Done
assignee:
  - '@jason'
created_date: '2026-11-08T01:55:00Z'
updated_date: '2026-11-08T02:20:00Z'
labels:
  - wayfinder:task
dependencies: []
parent_task_id: TASK-99
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The renderer spike (branch prototype/native-renderer-spike) rendered correctly on Android Vulkan but showed a black screen on GLES 3.0 after 300 frames. GLES 3.0 is Gable Native's compatibility floor (ADR 0005), so find the cause: wgpu GLES backend limitation, shader or format use in the compositor, surface or swapchain setup, or emulator behaviour. Done when the cause is known and either fixed in the spike or recorded as a ship-gate constraint.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-08T02:20:00Z

---

Cause found and fixed. The Android GLES black screen was the blit vertex shader indexing a function-local const array by vertex_index (c[i]); the emulator's SwiftShader ES 3.0 translator draws nothing for it. Presentation, surface format, blend, winding, uniforms and the compositor were all ruled out by bisect (compositor output reads back correct; same build is correct on emulator host-GPU ES 3.1). Replacing the array with arithmetic selects renders correctly on SwiftShader (swangle). Fix and evidence: prototype/native-renderer-spike commit 0134d5d, section 'Android GLES follow-up (TASK-99.24)' in docs/research/native-renderer-spike-report.md with PNGs. Ship-gate constraint candidate: no dynamically indexed local arrays in GLES 3.0 vertex shaders; validate GLES 3.0 on real Mali and Adreno, do not treat emulator SwiftShader as authoritative. Unverified: real Mali/Adreno, aarch64 .so never executed, Vulkan not rerun after the fix, desktop only cargo-checked. Scratch AVD gable-spike-api-37 kept for later runs (launch flags in the report); no emulator running.

---
<!-- COMMENTS:END -->
