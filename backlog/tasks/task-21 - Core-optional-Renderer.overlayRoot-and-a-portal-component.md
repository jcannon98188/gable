---
id: TASK-21
title: 'Core: optional Renderer.overlayRoot() and a portal component'
status: Done
assignee:
  - '@claude'
created_date: 2026-11-07 02:24
updated_date: '2026-11-07T02:44:00Z'
labels:
  - ui
  - core
  - ready-for-agent
dependencies:
  - TASK-20
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Overlays (Dialog, Popover, Tooltip) must render outside their parent. Add an optional renderer method for the overlay root (DOM: document.body or a dedicated container) and a documented portal component that moves its host there. Projected content must keep being built in the parent Env so bindings still work. Renderers without the method fail with an error naming the renderer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Renderer.overlayRoot() is optional and documented; the DOM renderer implements it
- [x] #2 A portal component moves projected content to the overlay root and cleans up on scope disposal
- [x] #3 Tests cover bindings inside portalled content, disposal and a renderer without overlayRoot
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gaps found by the TASK-20 spike (portal). 1) Zag finds every part by id via scope.getRootNode().getElementById(), so portalled content must land in the same document/root node as the trigger; a DOM overlayRoot (document.body or a container in the same document) is fine, a separate shadow root or second document is not. 2) Projected content is injected from the DECLARING component (view.injector), not from the slot owner, so DI-provided machine state (DialogState) stays visible to content that a portal later moves. Keep that property: the portal must move nodes only, not re-parent the Env/injector. 3) In the in-memory test renderer, the Zag facade (packages/ui-primitives/src/test-dom.ts) finds elements by walking from the host to the top of the TestNode tree, so an overlay root that is a separate TestNode tree would not be found. Make TestRenderer.overlayRoot() a child of the mounted root (or expose it via the fixture). 4) Zag effects that need the overlay (dismissable layer, focus trap, aria-hidden of siblings) assume content is attached to the document; they ran correctly in jsdom with content in place. Re-verify them after the move. 5) Zag Dialog does not portal anything itself: it only toggles hidden/data-state, so the spike dialog works without a portal but is subject to ancestor overflow/z-index/transform.

Design: Renderer.overlayRoot?(): N (core/renderer.ts, documented). DOM renderer: overlayRoot option (Element or function), default document.body. Test renderer: lazily created <gable-overlay> node, attached under the mounted host (mount() calls setOverlayContainer; resolveTarget too) so fixture queries and the Zag test-dom walk-to-top see it. UiPortal (ui-primitives/src/portal.ts, selector ui-portal, template <slot>): in Setup moves its own host (display: contents) into the overlay root; content is still built in the declaring Env/injector, so bindings and DialogState keep working; scope disposal removes the host. Missing overlayRoot throws an error naming the renderer (reported as a setup error). Known limit: a portal placed directly in a reordered keyed @for row is re-inserted into the row parent; documented. Dialog: wrap backdrop+positioner in ui-portal (documented in dialog.ts; DIALOG list unchanged). Tests: portal.test.ts (in-memory: bindings/events, disposal, no overlayRoot, dialog via portal) and portal.dom.test.ts (jsdom: body placement, focus, Escape, close, disposal, custom container). Spike gap 4 re-verified in jsdom. Core/testing/renderer-dom/ui-primitives suites pass except TASK-24's WIP items-slots.proto.test.ts; tsc clean for the four packages.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added optional Renderer.overlayRoot(), DOM and test renderer implementations, and a UiPortal component in @gable/ui-primitives that moves its host to the overlay root with bindings and injector intact and removes it on scope disposal. Errors name the renderer when overlayRoot is missing. Verified by 8 new tests (in-memory and jsdom); tsc clean. Risk: portal directly inside reordered keyed @for rows.
<!-- SECTION:FINAL_SUMMARY:END -->
