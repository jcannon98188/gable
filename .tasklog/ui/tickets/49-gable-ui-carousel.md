---
kind: ticket
title: "gable-ui: Carousel"
status: open
tags:
  - ui
  - in-progress
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-49 - gable-ui-Carousel.md
assignee:
  - '@claude'
ordinal: 90000
---

## Question

shadcn's Carousel wraps embla-carousel. Zag has a carousel machine that may fit, but slide registration and autoplay need investigation. Deferred from ui/28.

## Acceptance criteria

- [x] #1 Carousel with previous/next controls, keyboard support and optional indicators
- [x] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery

## Implementation plan

1. useCarousel primitive (scroll-snap tracking, goTo, keys, autoplay with hover/focus/reduced-motion pause). 2. UiCarousel/UiCarouselItem component + registry entry. 3. jsdom + axe tests. 4. Docs section and gallery page carousel.html.

## Implementation notes

Decision: did not use @zag-js/carousel (not installed; its machine would need every slide registered with indices and its own scroll tracking, while a native scroll-snap viewport needs only a scroll listener and scrollTo). Implemented useCarousel in ui-primitives/src/carousel.ts on CSS scroll-snap. Verified: 14 tests pass (jsdom behaviour, autoplay timers, reduced motion, axe with and without autoplay). Not covered: vertical orientation, RTL, real-browser scrolling and snapping (jsdom has no layout; layout is faked), gallery demo test (needs npm run pack:local to pick up the component).

## Final summary

Added useCarousel primitive and ui-carousel/ui-carousel-item (prev/next, keyboard, indicators, autoplay with pause on hover/focus, reduced-motion off, play/pause button, ARIA carousel/slide semantics, live region off while autoplaying). Tests: 14 pass incl. axe. Gallery page carousel.html added but not run (needs pack:local); AC 3 left unchecked.
