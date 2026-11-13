---
id: TASK-105.18
title: particle-container scene tag and ref helper
status: In Progress
assignee:
  - '@jason'
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-13T00:05:00Z'
labels: []
dependencies:
  - TASK-105.3
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.14: a first-class path for very high counts. Pixi particles are not display objects, so they are created and updated through a #ref helper, not child tags. The spike measured 100,000 particles at 3.9 ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A particle-container tag exists in the shared table, renderer, element map and test renderer
- [ ] #2 A ref helper creates and updates Pixi particles
- [ ] #3 Docs state the measured counts that justify moving to this tier
<!-- AC:END -->
