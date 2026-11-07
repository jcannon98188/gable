---
id: TASK-100.9
title: 'Engine M8: debugger interface and CDP adapter'
status: To Do
assignee: []
created_date: '2026-11-07T22:37:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.8
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable tooling needs breakpoints and stepping in the owned engine; the adopted engines have none. Spec section 9.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Breakpoints, stepping, frame and scope inspection, async stacks and script source work through the debugger interface
- [ ] #2 A separate CDP adapter crate supports console, source-mapped exceptions, breakpoints, stepping and evaluate, verified with a CDP client test
<!-- AC:END -->
