---
id: TASK-106.5
title: 'Runtime: default declarative worker driven by gable.sw.json'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.2
  - TASK-106.3
  - TASK-106.4
parent_task_id: TASK-106
ordinal: 266000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most apps should get offline support from configuration alone. The runtime wires core primitives from a config file and must use only core public surface, so gaps in core show up here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gable.sw.json supports asset groups (prefetch and lazy), data groups (freshness and performance) and a navigation fallback
- [ ] #2 Config is validated with clear errors
- [ ] #3 defineWorker({ config, extend }) adds custom routes and handlers on top of the declarative behaviour
- [ ] #4 Runtime uses only core public exports
<!-- AC:END -->
