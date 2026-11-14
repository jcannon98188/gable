---
id: TASK-106.4
title: 'Core: push and background sync handlers'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.2
  - TASK-106.3
parent_task_id: TASK-106
ordinal: 265000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Push and background sync are in v1 scope. Core needs handler primitives that leave the default runtime and custom workers free to use them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Push events and notification clicks are exposed through typed handlers
- [ ] #2 Background sync registrations and sync events are exposed through typed handlers
- [ ] #3 Tests cover each handler using the in-memory worker scope
<!-- AC:END -->
