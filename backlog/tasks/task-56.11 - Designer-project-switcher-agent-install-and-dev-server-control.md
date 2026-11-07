---
id: TASK-56.11
title: 'Designer: project switcher, agent install and dev server control'
status: To Do
assignee: []
created_date: '2026-11-07T15:20:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. Open project dialog, Preview agent install, and dev-server restart/log show unavailable states. Implement them in the Rust host/backend as thin as ADR 0002 allows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open project dialog picks a project, starts its Vite and connects; recent projects listed
- [ ] #2 Missing Preview agent can be installed from the connect flow; failed dev server shows log and a working Restart
- [ ] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->
