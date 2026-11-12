---
id: TASK-104.8
title: How do pointer, keyboard and gamepad input reach scene nodes?
status: To Do
assignee: []
created_date: '2026-11-12T06:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.3
parent_task_id: TASK-104
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide the input model on top of Pixi's federated events (`eventMode`, `.on`, bubbling, `hitArea`): which template event bindings exist on scene tags ((pointerdown), (pointertap), drag), how they map to Renderer.listen and to Gable's `$event` typing, how keyboard and gamepad (which Pixi does not provide) reach the game, how hit areas are expressed, and how scene input and DOM HUD input stay separate (focus, pointer capture).
<!-- SECTION:DESCRIPTION:END -->
