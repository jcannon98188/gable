---
id: TASK-105.8
title: Scene test renderer, test doubles and parity suite
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T23:41:00Z'
labels: []
dependencies:
  - TASK-105.3
  - TASK-105.4
  - TASK-105.5
  - TASK-105.6
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 246000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.10: createSceneTestRenderer in the /testing entry, an in-memory tree with the real tags and Pixi property semantics and no Pixi, plus deterministic fixture.frame(dt), simulated pointer, keyboard and gamepad via service doubles, provideTestAssets with scriptable bundle states, one mountApp fixture exposing fixture.scene beside fixture.root, Renderer.destroy and boundary layering support.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scene test renderer passes defineRendererConformance
- [ ] #2 A parity suite builds the same templates with real Pixi in Node (excluding Text and rendering) and compares properties and child order with the test renderer
- [ ] #3 fixture.scene.find returns plain data for position, visibility, alpha, texture, children, with draw order including zIndex
- [ ] #4 scene.pointer, scene.keyboard, scene.gamepad and fixture.frame drive the same code paths as production
- [ ] #5 provideTestAssets scripts loading, progress and failure, and asserts bundle release on scope disposal
- [ ] #6 A HUD click in the DOM tree can be asserted on a scene node in one fixture
<!-- AC:END -->
