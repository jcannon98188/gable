---
id: TASK-104.7
title: Which scene tags exist and how do their properties map onto Pixi objects?
status: To Do
assignee: []
created_date: '2026-11-12T06:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.3
parent_task_id: TASK-104
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

With PixiJS 8 chosen and the authoring prototype in hand, decide the tag vocabulary (container, sprite, text, bitmap-text, graphics, tiling-sprite, nine-slice, mask, filter, ... and which are deferred), how each tag's properties map to Pixi properties (x/y/position, scale, rotation, anchor/pivot, alpha, tint, visible, zIndex), how shapes in `graphics` are expressed declaratively (Pixi needs clear()-and-redraw on shape change), how tags are registered (an extensible registry so apps can add their own Pixi classes), how child order and `zIndex` interact, and how non-child relationships (mask, filters) attach.
<!-- SECTION:DESCRIPTION:END -->
