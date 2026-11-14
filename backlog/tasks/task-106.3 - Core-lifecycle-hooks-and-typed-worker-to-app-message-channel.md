---
id: TASK-106.3
title: 'Core: lifecycle hooks and typed worker-to-app message channel'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.1
parent_task_id: TASK-106
ordinal: 264000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The app-side services must talk to the default worker and to custom workers, so the message protocol is a public contract owned by core.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Install, activate and update lifecycle hooks are exposed with typed handlers
- [ ] #2 A typed message channel carries version-ready, version-activated and error events to clients
- [ ] #3 The protocol is documented as part of the public API
<!-- AC:END -->
