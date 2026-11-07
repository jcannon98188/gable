---
id: TASK-56.19
title: 'Designer: why did this update (reactive dependency graph)'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For the selected node/effect show which signals it depends on and, for a recent update, which signal change caused it (trace from the devtools hook); highlight updated nodes on the canvas. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selected node shows its dependencies and the cause of its last update
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
