---
id: TASK-56.10
title: 'Designer: Scenario writer and extract-component flows'
status: To Do
assignee: []
created_date: '2026-11-07T15:19:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. The Create Scenario and Extract component dialogs render but their actions are disabled. Implement the backend source writers (minimal patches per ADR 0001): append a scenario to the *.scenes.ts file; extract repeated classes/markup into a component.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create Scenario dialog writes a scene to the component's scenes file and it appears in the Scenarios list
- [ ] #2 Extract component dialog creates the component file and replaces the source with its usage, undoable as a reverse patch
- [ ] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->
