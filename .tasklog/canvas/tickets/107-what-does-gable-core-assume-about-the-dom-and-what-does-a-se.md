---
kind: ticket
title: ">-\n  What does Gable core assume about the DOM, and what does a second renderer\n  under a DOM app need?"
status: resolved
type: research
tags:
  - parent-104
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-104.2 - What-does-Gable-core-assume-about-the-DOM-and-what-does-a-second-renderer-under-a-DOM-app-need.md
assignee:
  - '@jason'
ordinal: 225000
---

## Question

Read packages/core (renderer.ts, app.ts, component.ts, template.ts, scope.ts, hmr.ts, input.ts, forms.ts, defer.ts), packages/renderer-dom and the test renderer, plus the Gable Native decisions on the renderer seam (native/106 and its resolution, ADR 0005) and report: (1) which Renderer contract operations a canvas/scene-graph renderer can implement naturally and which are awkward (tags and namespaces, setStyle/setClass, registerStyles, listen, fieldControl, overlayRoot, compare, captureViewState/restoreViewState); (2) how createComponent/bootstrap/RENDERER choose a renderer and whether a component inside a DOM app can render its subtree through a different renderer today (injector scoping, host nodes, control flow, content projection, @defer, HMR); (3) what in native/106's resolution we can reuse as-is for a canvas renderer; (4) gaps that would need core changes. Cite files and lines. Facts only, no design.

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12T05:47:00Z

---

Resolved by research on branch research/renderer-seam-for-canvas (docs/research/renderer-seam-for-canvas.md). Gaps: (1) no per-subtree renderer: the renderer is a function argument through view.ts/defer.ts, not on Env/injector/template syntax, so a second renderer mounts only from code, untested; (2) createComponent takes no parentScope and neither it nor instantiate installs renderer.providers (only bootstrap does); (3) native/106's Geometry, FrameScheduler and MediaQuery are not in the code, the contract still says synchronous, no per-window injector level; (4) browser globals in core (requestIdleCallback for @defer idle; matchMedia, startViewTransition, getComputedStyle in transitions), devtools and designer assume HTMLElement; (5) #ref returns the raw node, the 99.17 element facade does not exist.

---
<!-- COMMENTS:END -->
