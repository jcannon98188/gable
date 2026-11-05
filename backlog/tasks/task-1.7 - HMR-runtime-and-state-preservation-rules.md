---
id: TASK-1.7
title: HMR runtime and state-preservation rules
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:46'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.2
  - TASK-1.4
  - TASK-1.5
  - TASK-1.12
parent_task_id: TASK-1
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the HMR runtime model: component registry and in-place swap, DI/service patching, the update protocol, which state survives, and when it falls back to re-creating a subtree? Never a full reload unless the entry module changes.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:46
---
From Template syntax: parsed templates are cached per call site (strings-array identity); a changed module yields new strings arrays, so HMR invalidates templates by identity.
---
<!-- COMMENTS:END -->
