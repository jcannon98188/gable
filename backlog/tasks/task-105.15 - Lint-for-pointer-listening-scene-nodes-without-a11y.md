---
id: TASK-105.15
title: Lint for pointer-listening scene nodes without [a11y]
status: To Do
assignee: []
created_date: '2026-11-12T21:47:00Z'
updated_date: '2026-11-12T21:48:00Z'
labels: []
dependencies:
  - TASK-105.7
  - TASK-105.9
references:
  - backlog/tasks/task-104 - Gable-Canvas-design-map.md
parent_task_id: TASK-105
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-104.11 named this lint as a follow-up; TASK-104.12 made it release-blocking. It is a template language-service rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A rule with a stable id flags a scene node with a pointer listener and no [a11y]
- [ ] #2 Severity is configurable like other rules
- [ ] #3 Tests cover it
<!-- AC:END -->
