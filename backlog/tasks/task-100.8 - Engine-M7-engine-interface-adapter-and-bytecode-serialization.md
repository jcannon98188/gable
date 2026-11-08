---
id: TASK-100.8
title: 'Engine M7: engine-interface adapter and bytecode serialization'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
updated_date: '2026-11-08T23:07:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.7
  - TASK-100.11
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 209000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Host runtime only ever sees the engine interface, and production bundles ship precompiled code. Spec sections 3 and 7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Gable engine passes the engine-interface conformance kit
- [ ] #2 Bytecode saves and loads (round trip) and a version mismatch is rejected
- [ ] #3 Host-driven jobs, timers, interrupt and memory limits and realm creation are exercised by tests
<!-- AC:END -->
