---
id: TASK-1.17
title: Testing story
status: To Do
assignee: []
created_date: '2026-11-05 06:13'
updated_date: '2026-11-05 06:25'
labels:
  - 'wayfinder:grilling'
dependencies:
  - TASK-1.13
parent_task_id: TASK-1
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Question

How are components, services and routes unit-tested: the test renderer's public API, a component harness (`createComponent` with providers, querying and interacting with the node tree), controlling the coalesced microtask flush, faking time and Observables, testing router navigation, and which test runners are supported out of the box?
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-05 06:25
---
Amendment from Forms: Forms are model-first signals plus RxJS async validation; tests need deterministic flushing of validateAsync (debounce via the test scheduler) and a way to drive [field] bindings in the test renderer.
---
<!-- COMMENTS:END -->
