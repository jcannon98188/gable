---
id: TASK-104.6
title: How do signals drive the per-frame update model?
status: To Do
assignee: []
created_date: '2026-11-12T05:42:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.2
  - TASK-104.3
parent_task_id: TASK-104
ordinal: 229000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide how signal writes reach the scene and how time is modelled: retained-mode property writes batched once per frame (when the library re-renders versus when Gable flushes), who owns the ticker (library or Gable), the per-frame update hook and delta time, fixed-timestep simulation versus variable, whether high-rate state (positions at 60Hz) should be plain signals or a cheaper channel, and what the cost model is. Uses the renderer-seam research and the authoring prototype.
<!-- SECTION:DESCRIPTION:END -->
