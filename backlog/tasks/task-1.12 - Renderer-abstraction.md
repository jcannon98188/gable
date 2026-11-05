---
id: TASK-1.12
title: Renderer abstraction
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.4
  - TASK-1.5
parent_task_id: TASK-1
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

The DOM renderer must be one renderer among several, opening the way for a future gable.native. Where is the renderer seam: what does the core (components, DI, signals, parsed templates) hand to a renderer, what does a renderer implement (create/update/insert/remove nodes, events, styles), and how does that seam affect template syntax, HMR and the router? Only the seam is in v0; a native renderer is not.
<!-- SECTION:DESCRIPTION:END -->
