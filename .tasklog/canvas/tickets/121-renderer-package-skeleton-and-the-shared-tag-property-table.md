---
kind: ticket
title: Renderer package skeleton and the shared tag/property table
status: resolved
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-12
imported_from: backlog/tasks/task-105.2 - Renderer-package-skeleton-and-the-shared-tag-property-table.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 240000
---

## Question

canvas/117 chose one package, @gable/renderer-pixi, with entry points '.', '/testing' and '/elements'. The shared tag and property table (canvas/112: tags, Pixi property names, dotted axis paths, point-like props, event names and types, static attribute conversion) is the single source of truth for the Pixi renderer, the scene test renderer and the language-service element map, so it comes first.

## Acceptance criteria

- [x] #1 packages/renderer-pixi exists with pixi.js ^8 as a peer dependency, built like renderer-dom and joined to the lockstep release
- [x] #2 /elements exports the table and element-map types without importing pixi.js
- [x] #3 The table covers container, sprite, text, bitmap-text, graphics (with rect, rounded-rect, circle, ellipse, polygon children), tiling-sprite, nine-slice-sprite, with event names and types
- [x] #4 A conformance test checks the table's property names against Pixi's own classes

## Answer

Added packages/renderer-pixi (pixi.js ^8 peer, built like renderer-dom, in the lockstep release group) with entry points ., /testing (placeholder for canvas/127) and /elements. /elements holds the shared tag/property table (7 scene tags, 5 shape children, 34 federated events, static-attribute conversion, element-map builder) and does not import pixi.js. Conformance test instantiates the real Pixi classes and checks every table property, with a compile-time assertion that the event table equals AllFederatedEventMap. Verified after merge (integration 1590483): renderer-pixi, core, testing, renderer-dom all pass except the two known failures (hmr-review.test.ts, renderer-dom browser.test.ts). Note for canvas/122: eventMode/hitArea/interactiveChildren exist only after importing pixi.js/events.
