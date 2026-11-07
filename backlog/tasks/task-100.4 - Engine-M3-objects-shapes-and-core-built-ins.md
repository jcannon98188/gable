---
id: TASK-100.4
title: 'Engine M3: objects, shapes and core built-ins'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.3
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Property access speed and the bulk of the standard library. Spec sections 3 and 4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shapes with inline caches in the interpreter; dual one-byte/two-byte strings with ropes and interned atoms
- [ ] #2 Object, Function, Array, String, Number, Boolean, Symbol, Math, JSON, Error and the reflection built-ins pass their test262 directories or are excluded with reasons
<!-- AC:END -->
