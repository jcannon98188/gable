---
id: TASK-2.13
title: Forms
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:46'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.4
  - TASK-2.10
parent_task_id: TASK-2
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

form(model, schema) with fine-grained writable signal nodes, the reserved state namespace, sync rules, composition, conditional state, RxJS async validation, submit, array rows with stable keys, and the field directive in both renderers with the custom-control convention.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A form with sync and async validation, submit and server errors works through the Fixture
- [x] #2 Array rows keep state by key
- [x] #3 A model key named state is rejected
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Forms with sync/async validation, submit, array rows, field directive on both renderers; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
