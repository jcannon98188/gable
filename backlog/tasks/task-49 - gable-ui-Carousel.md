---
id: TASK-49
title: 'gable-ui: Carousel'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T03:32:00Z'
updated_date: '2026-11-07T04:36:00Z'
labels:
  - ui
dependencies: []
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Carousel wraps embla-carousel. Zag has a carousel machine that may fit, but slide registration and autoplay need investigation. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Carousel with previous/next controls, keyboard support and optional indicators
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. useCarousel primitive (scroll-snap tracking, goTo, keys, autoplay with hover/focus/reduced-motion pause). 2. UiCarousel/UiCarouselItem component + registry entry. 3. jsdom + axe tests. 4. Docs section and gallery page carousel.html.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: did not use @zag-js/carousel (not installed; its machine would need every slide registered with indices and its own scroll tracking, while a native scroll-snap viewport needs only a scroll listener and scrollTo). Implemented useCarousel in ui-primitives/src/carousel.ts on CSS scroll-snap. Verified: 14 tests pass (jsdom behaviour, autoplay timers, reduced motion, axe with and without autoplay). Not covered: vertical orientation, RTL, real-browser scrolling and snapping (jsdom has no layout; layout is faked), gallery demo test (needs npm run pack:local to pick up the component).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added useCarousel primitive and ui-carousel/ui-carousel-item (prev/next, keyboard, indicators, autoplay with pause on hover/focus, reduced-motion off, play/pause button, ARIA carousel/slide semantics, live region off while autoplaying). Tests: 14 pass incl. axe. Gallery page carousel.html added but not run (needs pack:local); AC 3 left unchecked.
<!-- SECTION:FINAL_SUMMARY:END -->
