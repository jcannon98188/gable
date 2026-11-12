---
id: TASK-105.20
title: 'Canvas devtools: frame overlay, Scene panel and Designer boundary support'
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T21:48:00Z'
labels: []
dependencies:
  - TASK-105.4
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 258000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: a dev-only frame overlay (debug attribute on <gable-canvas> or provideCanvasDebug()), a Scene panel in the browser devtools extension showing the display-object tree with source locations and the last flush's effects (reusing @gable/core/devtools flush records and why-reports), and Designer preview-agent support for a renderer boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The overlay shows per-phase ms, rolling p50 and p95, dropped frames, display-object count and bindings re-run in the last frame
- [ ] #2 The devtools extension shows the scene tree with source locations
- [ ] #3 The Designer's preview agent reports a boundary's scene tree like a DOM tree
- [ ] #4 None of it ships in production builds
<!-- AC:END -->
