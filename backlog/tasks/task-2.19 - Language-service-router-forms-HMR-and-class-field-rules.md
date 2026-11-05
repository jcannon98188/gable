---
id: TASK-2.19
title: 'Language service: router, forms, HMR and class-field rules'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 09:07'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.11
  - TASK-2.13
  - TASK-2.14
  - TASK-2.17
parent_task_id: TASK-2
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

File rules (constructors, module-level signals and subjects, lazy outside defer, non-literal Tailwind class fragments, tsconfig settings that break class fields) and the router and forms rules, with hotState suppressing the module-level warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each rule has a passing and a failing fixture through gable-check
- [x] #2 hotState suppresses the top-level warning
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
15 new rules (router, forms, file, class-field), @defer support in analyzer, hotState suppression; merged.
<!-- SECTION:FINAL_SUMMARY:END -->
