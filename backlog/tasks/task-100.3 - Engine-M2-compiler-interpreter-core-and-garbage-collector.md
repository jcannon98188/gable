---
id: TASK-100.3
title: 'Engine M2: compiler, interpreter core and garbage collector'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.2
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The core execution path: bytecode, interpreter and the collector everything else allocates through. Spec sections 3 and 5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Register-and-accumulator bytecode with compile-time slots runs statements, expressions, functions, closures and exceptions
- [ ] #2 The mark-sweep collector with scoped roots passes a GC stress mode in CI; unsafe is confined to heap and GC modules with documented invariants; Miri or sanitizer jobs run in CI
- [ ] #3 test262 language directories that need only core built-ins pass or are in the exclusions file with reasons
<!-- AC:END -->
