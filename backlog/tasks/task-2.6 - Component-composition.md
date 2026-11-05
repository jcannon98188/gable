---
id: TASK-2.6
title: Component composition
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:07'
updated_date: '2026-11-05 07:40'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.3
  - TASK-2.5
parent_task_id: TASK-2
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

meta.imports (components and attribute directives), input, output and model fields, default and named slots, signal-returning view and content queries, meta.host, scoped styles via registerStyles, createComponent and bootstrap taking the Renderer as an argument. An unknown element is a clear dev-time error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A parent composes children with inputs, outputs and slots in the Fixture
- [x] #2 Queries update reactively
- [x] #3 Scoped styles are applied and replaceable in place by id
- [x] #4 bootstrap mounts a root with providers and a target
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Composition merged: imports, input/output/model, slots, queries, meta.host, scoped styles via registerStyles, createComponent, bootstrap. Verified on merged integration (152 tests).
<!-- SECTION:FINAL_SUMMARY:END -->
