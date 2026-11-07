---
id: TASK-100.5
title: 'Engine M4: promises, jobs, generators, async functions and modules'
status: To Do
assignee: []
created_date: '2026-11-07T22:36:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.4
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gable apps are async and modular; HMR depends on module re-loading. Spec sections 3, 5 and 7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Promise jobs run only through the host-driven job queue, and rejections reach the promise-rejection tracker
- [ ] #2 Iterators, generators, async functions, async generators, static and dynamic modules, top-level await and import.meta (host hook) pass their test262 directories or are excluded with reasons
- [ ] #3 A module can be re-loaded under a new specifier and its old record is collected once unreachable, covered by a test
<!-- AC:END -->
