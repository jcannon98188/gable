---
id: TASK-104.10
title: How do scenes get tested without a GPU?
status: To Do
assignee: []
created_date: '2026-11-12T06:09:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.5
parent_task_id: TASK-104
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The spike found Pixi trees build in Node but `Text` measurement needs a DOM and rendering needs WebGL. Decide the test story: a Gable test renderer for scenes (an in-memory node tree with the same tags and property semantics, per the glossary's Test renderer), how tests assert on positions/visibility/draw order and simulate pointer events and frames, whether browser-based golden-image tests exist at all and where they run, and how the test renderer stays honest against the real Pixi mapping.
<!-- SECTION:DESCRIPTION:END -->
