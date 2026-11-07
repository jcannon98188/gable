---
id: TASK-45
title: 'Devtools: component tree, signal inspector and effect graph'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:30:00Z'
updated_date: '2026-11-07T05:00:00Z'
labels:
  - devtools
  - ready-for-agent
dependencies: []
priority: high
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Browser devtools for Gable. Start with a framework-side instrumentation layer (dev-only, tree-shaken in production, built on the existing DevHooks) exposing component tree, inputs, signals and computeds with current values and dependency edges, effect runs and flush timing, DI injector tree, router state and HMR events. Then a UI: a browser extension panel or an in-page overlay (decide in the first step, an overlay is the cheapest start). Store inspection comes from TASK-35. Highlight element on hover, jump to source via the Vite plugin, and edit a signal value from the panel.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dev-only instrumentation API exposes component tree, signals with dependencies, effect runs, injectors and router state, and is absent from production builds
- [ ] #2 A usable inspector UI (overlay or extension, decision recorded) lists and inspects them with live updates
- [ ] #3 Highlight on hover, jump to source and signal editing work, with tests for the instrumentation layer and a short guide
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (user): build a Chrome-based browser extension (Manifest V3: devtools_page panel, content script plus injected main-world hook, service worker relay), targeting Chrome, Edge and other Chromium browsers. Not an in-page overlay. The framework-side instrumentation API must stay transport-agnostic (a global hook object the extension talks to).

Instrumentation: packages/core/src/devtools.ts plus additive hooks (a separate devtools.current sink in dev-hooks.ts, so devtools work without HMR). Hook: window.__GABLE_DEVTOOLS_HOOK__ with call(method, params), connect(listener), element(id), componentFor(node), registerInspector(id, spec). Installed from index.ts under DEV. core package.json sideEffects now lists ./dist/index.js, otherwise bundlers drop the barrel's install call. Prod absence proven by packages/core/src/devtools-prod.test.ts (vite build with __GABLE_DEV__ false has no hook; true has it). Open-in-editor uses Vite /__open-in-editor, project root injected by @gable/vite as __GABLE_DEV_SERVER__.
Extension: packages/devtools-extension (MV3, build with npm run build -w packages/devtools-extension, load dist/ unpacked). Decision: panel UI is plain TypeScript, not Gable (small, no self-inspection, no framework dependency). Tests: protocol guards, relay, and an end-to-end page-hook -> bridge -> content -> relay -> client -> panel model path (src/extension.test.ts). Guide: docs/devtools.md with the manual checklist.
NOT verified: nothing was run in a real browser, so the panel rendering (view.ts), chrome.* glue (main.ts, background.ts, devtools.ts), the built dist loading as an unpacked extension, hover highlight, click-to-open-in-editor and editing from the real panel are untested. AC2 and AC3 are left unchecked for that reason; the checklist in docs/devtools.md lists what to check.

Housekeeping: packages/devtools-extension added to the root build script (npm run build builds it).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Core instrumentation layer (dev-only, tree-shaken, tested on the in-memory renderer and by a production-build test) and a Manifest V3 extension package with panel, relay, build script, tests and docs/devtools.md. 376 tests pass across core, testing, vite and devtools-extension; tsc clean for core and the extension. Real-browser verification of the panel is outstanding (AC2, AC3): follow the checklist in docs/devtools.md.
<!-- SECTION:FINAL_SUMMARY:END -->
