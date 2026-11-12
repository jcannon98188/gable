---
id: TASK-104.5
title: How does a canvas scene mount inside a DOM app?
status: To Do
assignee: []
created_date: '2026-11-12T05:42:00Z'
labels:
  - wayfinder:grilling
dependencies:
  - TASK-104.2
parent_task_id: TASK-104
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Decide the hosting model using the renderer-seam research: a <gable-canvas>-style host component in a DOM app whose subtree renders through the canvas renderer (versus a whole-app canvas renderer), how the second renderer is scoped through the injector, how DOM content and scene content communicate (signals shared through DI, events out), what core changes (if any) are accepted, and how HMR and teardown behave for the subtree.
<!-- SECTION:DESCRIPTION:END -->
