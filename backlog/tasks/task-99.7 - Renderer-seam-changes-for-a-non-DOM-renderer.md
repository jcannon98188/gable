---
id: TASK-99.7
title: Renderer seam changes for a non-DOM renderer
status: Done
assignee:
  - '@jason'
created_date: '2026-11-07T21:37:00Z'
updated_date: '2026-11-07T22:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-99.6
parent_task_id: TASK-99
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Which parts of the current Renderer contract in packages/core/src/renderer.ts are DOM-isms that must change or be generalised for Gable Native: setClass and setStyle, CSS-string registerStyles, setProperty names, $event shape, fieldControl, overlayRoot, compare, captureViewState, observeTrigger, resolveTarget, and the synchronous-call assumption across a JS/native boundary? Decide what the seam becomes and what the DOM renderer and Test renderer must adapt to. Note any contradiction with the Gable v0 Renderer abstraction decision.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-07T22:09:00Z

---

Resolved with the user. The Renderer seam stays low-level and nodes-only; only the contract wording and the DOM leaks change. (1) Write ops keep their names and signatures (createElement, createText, createAnchor, setProperty, setAttribute, setClass, setStyle, setText, insert, remove, listen); the native renderer allocates integer handles on the JS side and queues ops into one command buffer per core flush, so the contract becomes "applied by the end of the flush". This amends the v0 Renderer abstraction decision ("all synchronous"); the DOM and Test renderers still apply immediately, which satisfies the new wording. (2) Reads move out of the Renderer into three abstract Platform-service Tokens in core platform: Geometry (node rect, observeSize, scrollIntoView), FrameScheduler (requestAnimationFrame equivalent) and MediaQuery (width, colour scheme, reduced motion, pointer type, replacing matchMedia). The DOM implementations wrap browser APIs; native reads flush the pending batch, run layout and block. A later port moves ui-primitives and gable-ui off their direct getBoundingClientRect (21 uses), ResizeObserver, getComputedStyle, matchMedia, requestAnimationFrame and scrollIntoView calls; that port is out of scope but is a requirement the spec lists. (3) setClass, setStyle and registerStyles keep their signatures; registerStyles loosens from CSS to a style source in a format the renderer documents, with an optionally empty scoping token; semantics come from the styling model ticket. (4) setProperty on native carries only strings, numbers, booleans, null and node handles; anything else is a dev-time error naming the renderer and property; the DOM renderer still accepts anything. (5) Events use DOM-compatible names and fields (click, pointerdown, pointermove, pointerup, keydown, keyup, input, change, focus, blur, scroll, wheel); $event is a plain data object with preventDefault and stopPropagation; a cancelable event with a listener is a blocking round trip, everything else is non-blocking, scroll, wheel and touch-move are passive by default; touch and mouse arrive as pointer events. (6) remove is terminal: verified in the core, remove is only called on discarded views, rows and error cleanups and moves use insert on attached nodes; since the core removes only the root nodes of a part, the host releases the whole subtree under a removed root, and removal may be deferred by holdRemoval for exit animations. compare is served from a JS-side mirror of tree order with no blocking call. fieldControl, overlayRoot (a top layer in the same window), resolveTarget (a window identifier such as "main"), observeTrigger (viewport, interaction, and pointer-only hover) and the optional captureViewState and restoreViewState (focus, scroll, text selection) keep their signatures with native implementations. The Test renderer has no new obligations beyond fakes for the three new Tokens. macOS: nothing here is platform-specific; Cmd shortcuts and the menu bar fall to the Platform services ticket.

---
<!-- COMMENTS:END -->
