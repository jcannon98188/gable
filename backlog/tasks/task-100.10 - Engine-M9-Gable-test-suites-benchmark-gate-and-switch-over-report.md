---
id: TASK-100.10
title: 'Engine M9: Gable test suites, benchmark gate and switch-over report'
status: To Do
assignee: []
created_date: '2026-11-07T22:37:00Z'
updated_date: '2026-11-09T00:23:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-100.9
documentation:
  - docs/js-engine-spec.md
parent_task_id: TASK-100
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Gable engine replaces the interim engine as soon as it is usable: spec section 11 conditions 1, 2 and 4 (test262, Gable's own suites, first-version debugger). Performance is reported, not gated; the maintainer has committed to adopting the engine and gaps are fixed afterwards (TASK-100.14). No maintainer sign-off is required for the switch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A benchmark set (signal churn, RxJS pipelines, the template interpreter, list diffing, gable-ui bundle startup) exists and the interim engine's baseline and the Gable engine's numbers are recorded and reported, with no tolerance gate
- [ ] #2 Gable's own test suites (core, router, forms, store and the rest) run under the Gable engine in CI
- [ ] #3 A report evaluates each switch-over condition in spec section 11 and is written for the maintainer to read as a baseline
- [ ] #4 If conditions 1, 2 and 4 hold, the Gable engine is made the default with the interim engine still selectable for one release; if any does not hold, the report says which and why, and the default is left unchanged
<!-- AC:END -->
