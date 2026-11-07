---
id: TASK-56
title: 'gable-designer: visual editor for Gable apps'
status: To Do
assignee: []
created_date: '2026-11-07T03:57:00Z'
labels:
  - needs-triage
dependencies: []
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable apps can only be edited in an IDE today. Its data-oriented design (runtime-interpreted templates, signals, a pluggable Renderer, true HMR, injectable providers) makes it possible to see and edit a running app visually, for developers and for designers or others who should not need much code knowledge.

Decisions so far (from design discussion):
- Standalone desktop tool built with Tauri, which uses the OS webview rather than bundling a browser. Rust stays thin: file access and watching, spawning the dev server, windowing, a preview protocol/proxy. The shell itself is a Gable app so it can reuse template-format, the language service and @gable/testing in TypeScript.
- Assumes a normal dev environment (Node, installed deps). It runs the project own Vite; a self-contained dev server is out of scope.
- Source files stay the source of truth. Visual edits become minimal text patches to the template, static meta and CSS via a dev-server write endpoint; HMR updates the canvas. No separate design model, no lock-in. Opaque ${} holes and dynamic expressions are shown read-only and never rewritten. Undo is a reverse patch.
- Two modes over one preview agent: component mode (isolated mount with scenarios: inputs plus provider overrides, authored as plain TypeScript, e.g. todo-item.scenes.ts) and page mode (the real app with the router and optional HTTP mocking).
- A dev-only agent in the preview (instrumenting Renderer plus DevHooks) reports the component tree, node-to-source ranges and live signal values to the shell over postMessage.
- Low-code principle: every operation has a direct-manipulation form (select on canvas, edit in panels, insert from a palette, bind from a list of existing signals); the code pane is optional. Equally useful to developers: two-way selection with code, live component/injector/signal inspector, language-service diagnostics on the canvas, HMR timeline (patch vs re-setup), a11y checks.
- Device emulation: iframe size/DPR scaling everywhere; CDP-backed emulation (touch, pointer/hover, color scheme, reduced motion, UA, forced pseudo-states) on Windows WebView2 only, with documented fallbacks elsewhere. Multiple frames side by side.
- Tailwind mode: use Tailwind v4 own design system API to read the project theme, class list and CSS per class; edit static class tokens only; breakpoint and state variants driven by the selected frame and a state toolbar.

Known risks: preview fidelity differs per OS webview (WebKitGTK weakest); node-to-source mapping through the runtime template parse (check whether positions are kept); Tailwind design-system loader API is marked unstable; html ${} holes currently throw at runtime (TASK-30).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Child tasks cover the spike, inspector and component mode, source write-back, device emulation, Tailwind mode and page mode with scenarios
- [ ] #2 An ADR records the Tauri shell and source-files-as-truth decisions
- [ ] #3 GLOSSARY.md defines the designer terms (Designer, Agent, Scenario, Frame)
<!-- AC:END -->
