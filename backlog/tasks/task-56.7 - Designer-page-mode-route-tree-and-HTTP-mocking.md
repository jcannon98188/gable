---
id: TASK-56.7
title: 'Designer: page mode, route tree and HTTP mocking'
status: To Do
assignee: []
created_date: '2026-11-07T03:58:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.3
parent_task_id: TASK-56
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Whole pages need the real app running with routing and data, without requiring a live backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Page mode runs the app with the router, shows a route tree and URL bar, and navigates by route
- [ ] #2 HTTP calls can be mocked per scenario through the HTTP backend token
- [ ] #3 Routes can be added and edited, written back to the route config
- [ ] #4 Scenarios can be shared between page mode and component mode
<!-- AC:END -->
