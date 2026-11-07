---
id: TASK-41
title: Route transitions and animation story
status: Done
assignee: []
created_date: '2026-11-07T03:29:00Z'
updated_date: '2026-11-07T05:00:00Z'
labels:
  - animation
  - router
  - ready-for-agent
dependencies:
  - TASK-22
priority: low
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Presence handles enter and exit animation of components. Define and document the story for route transitions (outgoing and incoming views, CSS-driven, with optional View Transitions API support) and for list animations, reusing the presence hook. Provide an example and any missing core hook.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Route transition mechanism documented and implemented using presence or the View Transitions API with a fallback
- [x] #2 Example in an app or the ui-gallery, with tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. transition.ts options + provideRouteTransitions; 2. outlet css mode via holdRemoval, view mode via startViewTransition, reduced-motion skip; 3. Route.transition; 4. tests (in-memory, jsdom); 5. docs Transitions section; 6. ui-gallery transitions example
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in packages/core/src/transition.ts and router-view.ts (RouterOutlet.transition input, Route.transition, provideRouteTransitions). Tests: packages/testing/src/route-transitions.test.ts, packages/renderer-dom/src/route-transitions.test.ts, examples/ui-gallery/src/transitions-demo.test.ts (passes via root aliases; gallery uses vendored tarballs, so it needs pack-local refresh to run in its own vitest). computedExitDuration duplicates presence domEnv timing parsing; follow-up could share it.

Housekeeping: computedExitDuration now lives in packages/core/src/exit-duration.ts (exported via @gable/core/internal); transition.ts and ui-primitives presence.ts both use it, duplicate parser removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Route transitions: opt-in per outlet/route/router. CSS mode keeps outgoing view (data-state=closed) via holdRemoval until animationend; view mode wraps swap in document.startViewTransition with immediate-swap fallback; both skipped under prefers-reduced-motion. Documented in docs/router.md (Transitions, list animation with uiPresence). Example at ui-gallery /transitions.html with tests. core/renderer-dom/testing/ui-primitives vitest all green.
<!-- SECTION:FINAL_SUMMARY:END -->
