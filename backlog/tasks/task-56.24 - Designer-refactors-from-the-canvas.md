---
id: TASK-56.24
title: 'Designer: refactors from the canvas'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename component (all uses and imports), extract repeated element into a shared component with props, find all uses of a class or component; as multi-file minimal patches with one undo step. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rename, extract-with-props and find-uses work and undo as one step
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
