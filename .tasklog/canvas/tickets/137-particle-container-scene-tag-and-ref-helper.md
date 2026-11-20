---
kind: ticket
title: particle-container scene tag and ref helper
status: resolved
blocked_by: [122]
tags:
  - parent-105
created: 2026-11-12
updated: 2026-11-13
imported_from: backlog/tasks/task-105.18 - particle-container-scene-tag-and-ref-helper.md
assignee:
  - '@jason'
references:
  - .tasklog/canvas/tickets/104-gable-canvas-design-map.md
ordinal: 256000
---

## Question

canvas/119: a first-class path for very high counts. Pixi particles are not display objects, so they are created and updated through a #ref helper, not child tags. The spike measured 100,000 particles at 3.9 ms.

## Acceptance criteria

- [x] #1 A particle-container tag exists in the shared table, renderer, element map and test renderer
- [x] #2 A ref helper creates and updates Pixi particles
- [x] #3 Docs state the measured counts that justify moving to this tier

## Answer

Added the particle-container scene tag (shared table, Pixi renderer, element map, scene test renderer) and a particles(ref) helper that adds, updates and removes Pixi particles; children tags are refused with a pointer to the helper. The tag exposes a dynamicProperties property, written onto the real ParticleContainer's property flags. docs/canvas-particles.md states the measured counts (100,000 particles at 3.9 ms) that justify the tier. Merge reconciliation: the implementer's Renderer.hasTag duplicated Renderer.knowsElement (f6fd4ee); kept only knowsElement and removed hasTag from core renderer.ts, view.ts and both pixi renderers. The particle-container-from-template test still passes on both renderers. Verification: vitest on packages/core, renderer-pixi, testing, language-service: 76 files passed, 911 tests passed. Note: renderer-pixi tsc build fails only on pre-existing golden-image.ts Buffer typing (from canvas/133, missing @types/node), unrelated to this merge.
