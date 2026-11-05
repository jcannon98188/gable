---
id: TASK-1.13
title: Error handling
status: To Do
assignee: []
created_date: '2026-11-05 06:13'
labels:
  - 'wayfinder:grilling'
dependencies: []
parent_task_id: TASK-1
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

Several decisions route failures to "the app error handler" (observable and promise binding, toSignal/toObservable, HMR rollback). What is that handler: its Token and default behaviour, how errors in setup, effects, event handlers and template evaluation are caught and attributed to a component, whether there are error boundaries, and what the dev-time error overlay can hook into?
<!-- SECTION:DESCRIPTION:END -->
