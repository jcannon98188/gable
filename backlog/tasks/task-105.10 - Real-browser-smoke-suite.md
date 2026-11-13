---
id: TASK-105.10
title: Real-browser smoke suite
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:08:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.5
  - TASK-105.9
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.10: one opt-in real Chromium suite with WebGL, run in CI only on canvas package changes, mounting a scene through the real renderer to catch wiring mistakes that no double can (host lifecycle, DOM and scene event path), plus an axe-core check on a host with an a11y mirror (TASK-104.11).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A scene mounts through the real renderer and renders non-blank
- [x] #2 A pointer event reaches a scene node and a keyboard event reaches the Keyboard service
- [x] #3 axe-core reports no violations on a host with an a11y mirror
- [x] #4 The suite runs in CI only when the canvas package changes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the opt-in real-browser smoke suite for the canvas binding: packages/renderer-pixi/src/browser-smoke.test.ts with page code in browser-page/smoke.ts (headless Chromium/Edge via --dump-dom, no Playwright) mounts a scene through the real renderer and reads canvas pixels (red rect [255,0,0,255], transparent outside), dispatches pointer and key events on the real canvas/host (pointertap handler fires, Pointer.position, Keyboard.isDown), and runs axe-core on the host with the a11y mirror (no violations). Skipped unless GABLE_BROWSER_SMOKE=1 (throws if set and no Chromium is found); .github/workflows/canvas-browser.yml runs it only on changes under packages/renderer-pixi, packages/core, packages/renderer-dom. Verified after merge (integration 3ed011a): full root suites 86 files/988 tests pass, smoke 1/1 in headless Edge. Gaps: the Linux/Chrome CI job has not run; pointer events sent before the scene's first frames fall through to the stage (not investigated for real users); events are synthetic DOM events, not OS-level input.
<!-- SECTION:FINAL_SUMMARY:END -->
