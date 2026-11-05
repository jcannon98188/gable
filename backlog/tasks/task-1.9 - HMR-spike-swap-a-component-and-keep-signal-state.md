---
id: TASK-1.9
title: 'HMR spike: swap a component and keep signal state'
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 05:38'
labels:
  - 'wayfinder:prototype'
dependencies:
  - TASK-1.2
  - TASK-1.5
parent_task_id: TASK-1
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Prototype a minimal component swap that preserves signal state, to test whether the HMR model feels and behaves right before it is locked.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 05:28
---
From HMR runtime: the spike should validate re-setup with state transfer (new instance, fields transferred by name/kind, old scope disposed, view rebuilt), canonical-class patching, and the service cascade; also that computed and effect edits take effect and a template swap keeps signal state.
---

created: 2026-11-05 05:38
---
From Dev server and bundler: the spike should run on Vite with the @gable/vite plugin appending import.meta.hot?.accept(m => __gableHmr.update(import.meta.url, m)) to modules importing gable; ids come from the module namespace (module URL + export name).
---
<!-- COMMENTS:END -->
