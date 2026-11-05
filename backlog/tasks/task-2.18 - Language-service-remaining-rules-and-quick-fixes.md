---
id: TASK-2.18
title: 'Language service: remaining rules and quick fixes'
status: Done
assignee:
  - '@jason'
created_date: '2026-11-05 07:08'
updated_date: '2026-11-05 08:05'
labels:
  - ready-for-agent
dependencies:
  - TASK-2.4
  - TASK-2.17
parent_task_id: TASK-2
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

The Gable v0 client-side framework spec. Read its relevant sections and the closed design tickets under the design map before building.

## What to build

Event and two-way rules, Observable and Promise typing as value or undefined, scope typing for loops and lets, did-you-mean suggestions, and quick fixes that extract a computed view-model signal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each rule has a passing and a failing fixture
- [x] #2 Quick fixes produce code that type-checks
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Event/two-way/scope/Observable rules, did-you-mean, quick fixes and gable-check --fix; merged, 241 tests green.
<!-- SECTION:FINAL_SUMMARY:END -->
