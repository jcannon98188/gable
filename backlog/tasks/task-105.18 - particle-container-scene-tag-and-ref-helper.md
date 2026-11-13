---
id: TASK-105.18
title: particle-container scene tag and ref helper
status: Done
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:23:00Z'
labels: []
dependencies:
  - TASK-105.3
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: a first-class path for very high counts. Pixi particles are not display objects, so they are created and updated through a #ref helper, not child tags. The spike measured 100,000 particles at 3.9 ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A particle-container tag exists in the shared table, renderer, element map and test renderer
- [x] #2 A ref helper creates and updates Pixi particles
- [x] #3 Docs state the measured counts that justify moving to this tier
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the particle-container scene tag (shared table, Pixi renderer, element map, scene test renderer) and a particles(ref) helper that adds, updates and removes Pixi particles; children tags are refused with a pointer to the helper. The tag exposes a dynamicProperties property, written onto the real ParticleContainer's property flags. docs/canvas-particles.md states the measured counts (100,000 particles at 3.9 ms) that justify the tier. Merge reconciliation: the implementer's Renderer.hasTag duplicated Renderer.knowsElement (f6fd4ee); kept only knowsElement and removed hasTag from core renderer.ts, view.ts and both pixi renderers. The particle-container-from-template test still passes on both renderers. Verification: vitest on packages/core, renderer-pixi, testing, language-service: 76 files passed, 911 tests passed. Note: renderer-pixi tsc build fails only on pre-existing golden-image.ts Buffer typing (from TASK-105.14, missing @types/node), unrelated to this merge.
<!-- SECTION:FINAL_SUMMARY:END -->
