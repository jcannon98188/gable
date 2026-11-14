---
id: TASK-106.6
title: 'App side: injectable services and update signal'
status: To Do
assignee: []
created_date: '2026-11-13T19:56:00Z'
labels: []
dependencies:
  - TASK-106.3
parent_task_id: TASK-106
ordinal: 267000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Apps need to register the worker and decide when users get new code. Updates are app-controlled: the app is told one is ready and activates it when it chooses. The services must work with the default worker and a custom one, so they depend only on the message protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Registration service registers only in production builds and is a no-op in dev so HMR is unaffected
- [ ] #2 Update-available is a signal; checkForUpdate() and activateUpdate() work
- [ ] #3 Version, push and notification-click events are exposed as Observables
- [ ] #4 Tested against the in-memory worker scope and against a custom worker built on core
<!-- AC:END -->
