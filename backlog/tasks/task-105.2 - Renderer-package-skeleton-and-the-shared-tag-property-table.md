---
id: TASK-105.2
title: Renderer package skeleton and the shared tag/property table
status: To Do
assignee: []
created_date: '2026-11-12T21:46:00Z'
labels: []
dependencies: []
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.12 chose one package, @gable/renderer-pixi, with entry points '.', '/testing' and '/elements'. The shared tag and property table (TASK-104.7: tags, Pixi property names, dotted axis paths, point-like props, event names and types, static attribute conversion) is the single source of truth for the Pixi renderer, the scene test renderer and the language-service element map, so it comes first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/renderer-pixi exists with pixi.js ^8 as a peer dependency, built like renderer-dom and joined to the lockstep release
- [ ] #2 /elements exports the table and element-map types without importing pixi.js
- [ ] #3 The table covers container, sprite, text, bitmap-text, graphics (with rect, rounded-rect, circle, ellipse, polygon children), tiling-sprite, nine-slice-sprite, with event names and types
- [ ] #4 A conformance test checks the table's property names against Pixi's own classes
<!-- AC:END -->
