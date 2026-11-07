---
id: TASK-56.9
title: 'Designer: patch diff and accessibility checks'
status: To Do
assignee: []
created_date: '2026-11-07T15:19:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.8
parent_task_id: TASK-56
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-56.8. The Code drawer shows only the patch label/file/state; the Accessibility tab says it has no checks. Backend must return the applied patch diff, and the Preview agent must run a11y checks (e.g. contrast, missing labels/alt, roles) and report them over the protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Code tab shows the real unified diff of the last applied patch, with Undo
- [ ] #2 Accessibility tab lists checks from the Preview agent with element link and badge count; selecting a row selects the element
- [ ] #3 Tests added; tsc, designer build and full vitest pass
<!-- AC:END -->
