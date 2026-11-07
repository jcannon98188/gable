---
id: TASK-38
title: 'Router accessibility: announce route changes and manage focus'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T03:29:00Z'
updated_date: '2026-11-07T03:46:00Z'
labels:
  - a11y
  - router
  - ready-for-agent
dependencies: []
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Single-page navigation must be perceivable to assistive tech. After each completed navigation, announce the new page (from title or a route data field) through a live region and move focus to a sensible target (main heading or a configurable element), with an opt-out and per-route override. Include a reusable LiveAnnouncer service (polite and assertive regions, in the overlay root or document, renderer-aware) usable by apps and by gable-ui components such as toasts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A LiveAnnouncer service exists and is tested in the in-memory renderer and jsdom
- [x] #2 Router announces and moves focus after navigation, configurable globally and per route, and respects the opt-out
- [x] #3 Documented in docs/router.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
LiveAnnouncer + FocusManager abstract services in core platform; DOM and in-memory impls; Router a11y options via provideRouter + per-route announce/focus; tests in testing and jsdom; docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added LiveAnnouncer and FocusManager (core/platform.ts, exported from @gable/core/renderer), DOM impl (renderer-dom/platform.ts: hidden status/alert regions in overlayRoot or body, tabindex=-1 focus), in-memory impl (testing/platform.ts: messages/polite/assertive, focused node found in mounted tree). Router: provideRouter(routes, { a11y }) with announce/politeness/focus/initial; Route.announce and Route.focus override/opt out. Skips initial navigation and same-path (query/fragment) changes; runs via runAfterFlush so the new view exists. mountApp takes a11y and exposes announcer/focus. Tests: testing/src/router-a11y.test.ts, renderer-dom/src/a11y.test.ts. Docs: router.md, accessibility.md. Note: error-boundary tests failing belong to TASK-42; browser.test viewport trigger failed once (unrelated).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
LiveAnnouncer and FocusManager services with DOM and in-memory implementations; router announces the page and moves focus after each completed navigation, configurable via provideRouter a11y options and per-route announce/focus (false opts out). Documented in docs/router.md and docs/accessibility.md; tested in testing and jsdom.
<!-- SECTION:FINAL_SUMMARY:END -->
