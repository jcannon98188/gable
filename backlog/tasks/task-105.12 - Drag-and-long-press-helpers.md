---
id: TASK-105.12
title: Drag and long-press helpers
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T21:48:00Z'
labels: []
dependencies:
  - TASK-105.5
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drag and long-press are composed from pointer events plus the Pointer service (TASK-104.8); helper functions were deferred and are now release-blocking (TASK-104.12).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Helper functions provide drag and long-press from pointer events and the Pointer service
- [ ] #2 They clean up with their scope and have tests through the test renderer
<!-- AC:END -->
