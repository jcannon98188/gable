---
id: TASK-100.10
title: 'Engine M9: Gable test suites, benchmark gate and switch-over report'
status: To Do
assignee: []
created_date: '2026-11-07T22:37:00Z'
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
The Gable engine replaces the interim engine only when the switch-over rule is met. Spec section 11.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A benchmark set (signal churn, RxJS pipelines, the template interpreter, list diffing, gable-ui bundle startup) exists, the interim engine's baseline is recorded and the tolerance is proposed to the maintainer
- [ ] #2 Gable's own test suites (core, router, forms, store and the rest) run under the Gable engine in CI
- [ ] #3 A report evaluates each switch-over condition in spec section 11; the maintainer, not the agent, decides the switch
<!-- AC:END -->
