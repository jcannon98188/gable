---
id: TASK-1.6
title: Signals and RxJS interop API
status: To Do
assignee: []
created_date: '2026-11-05 04:20'
updated_date: '2026-11-05 04:46'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.1
parent_task_id: TASK-1
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

What is the exact interop surface: signal/observable bridges, direct binding of either in templates, subscription ownership and cleanup, and how router/HTTP/forms/events expose both shapes?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 04:34
---
From Component model and hierarchical DI: scheduling must cover RxJS. Observable emissions reaching templates/effects go through this bridge into signal writes (same coalesced microtask flush), and gable exports an RxJS SchedulerLike (renderScheduler) aligned with the render flush. output() is also an Observable.
---

created: 2026-11-05 04:46
---
From Template syntax: the built-in async pipe (Observables and Promises, always available) is a template-level user of this bridge; emissions must schedule through the one coalesced flush.
---
<!-- COMMENTS:END -->
