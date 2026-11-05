---
id: TASK-1.12
title: Renderer abstraction
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:34'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:34
---
From Component model and hierarchical DI: bootstrap(Root, { renderer, providers }) takes the renderer as an argument; hosts are renderer-provided (createComponent({ host })); style scoping and host bindings are renderer-owned; HMR needs a renderer operation to re-run a view against the same instance.
---
<!-- COMMENTS:END -->
