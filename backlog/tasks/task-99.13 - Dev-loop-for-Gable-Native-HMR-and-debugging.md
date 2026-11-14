---
id: TASK-99.13
title: 'Dev loop for Gable Native: HMR and debugging'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T22:09:00Z'
updated_date: '2026-11-07T23:18:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.7
  - TASK-99.11
parent_task_id: TASK-99
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How does a developer run and iterate on a Gable Native app: loading from the project's Vite dev server in the host runtime, true HMR (state preserved, no reload) on a desktop window and on an Android device, how the engine interface supplies hot-update hooks, debugging and inspector support, error overlays, and how the Designer could later preview native apps (as requirements only).
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @jason
created: 2026-11-07T23:18:00Z

---

Resolved with the user. Loading: the host runtime has a dev mode that takes a dev-server URL; the engine module loader fetches modules over HTTP from the project's Vite dev server (Vite transpiles TypeScript), including dynamic import(); the host ships its own small Vite HMR client implementing the import.meta.hot context (accept, dispose, data, invalidate, on) and the HMR WebSocket protocol, because Vite's browser client needs a DOM and WebSocket global; @gable/vite gains a native target (separate module graph, native resolve conditions, no browser-only injections); Vite HMR protocol compatibility is tested in CI against supported Vite versions. Running: a prebuilt dev host (the host runtime in dev mode, installed once like a dev client) is opened by the CLI with the dev-server URL (gable native dev); desktop opens a window; Android uses adb reverse for the Vite and debugger ports by default with a LAN URL option; the host is rebuilt only when native code or the host version changes; on macOS the dev host is signed and notarized by the release process so it runs without Gatekeeper prompts; packaging and signing stay in the packaging fog. HMR: @gable/core/hmr runs unchanged (it is driven by import.meta.hot.accept, already renderer-independent, rolls back failed updates and reports reload); the host provides import.meta.hot through the engine's import.meta hook and re-loads changed modules under a new specifier; state transfer and rollback are as today; captureViewState and restoreViewState (focus, scroll, selection) carry view state through the Renderer seam; a full reload creates a new realm, re-evaluates the entry and remounts into the same window, preserving window position and size, the dev-server connection and the debugger session; style updates apply through registerStyles with no reload. Error overlay: drawn by the host in a separate top layer outside the app's node tree so a broken app still shows it; shows Vite build errors, Gable error-handler errors and unhandled rejections with source-mapped stacks and open-in-editor links; clears after a successful update and is dismissible; dev mode only. Debugging: with the Gable engine the dev host exposes the engine debugger over a localhost CDP port so Chrome DevTools and VS Code attach; the port is off in production builds and Android reaches it through adb reverse; source maps come from Vite and the host maps stack traces to original TypeScript; the interim engine (QuickJS-NG) has no inspector, so until the Gable engine debugger milestone lands, interim debugging is console output, source-mapped errors and the Gable devtools, and no QuickJS debugger is built. Gable devtools: the host exposes the existing devtools protocol (component tree, signals, injectors, flushes, router, HMR log) over a localhost WebSocket and the panel UI is served as a normal page that opens in a browser; no browser extension for native; the same protocol serves DOM and native. Designer preview of native apps is out of scope as a port, but the host runtime must support, as requirements only: (1) an offscreen or headless surface that streams frames as images; (2) the preview agent over the same devtools transport; (3) a node-to-source-location mapping for every rendered node, available through the devtools protocol; (4) synthetic pointer and keyboard input injection through the host; (5) several instances at a chosen size, scale, colour scheme and input capability by overriding Geometry and MediaQuery per window or instance. macOS: the dev host needs notarization; nothing else is platform-specific.

---
<!-- COMMENTS:END -->
