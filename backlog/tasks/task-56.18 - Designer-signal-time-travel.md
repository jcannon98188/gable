---
id: TASK-56.18
title: 'Designer: signal time travel'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.17
parent_task_id: TASK-56
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record signal updates per frame (bounded ring buffer) from the devtools hook and let the user scrub back and forward through states, applying them to the live frame; timeline lives in the drawer next to HMR. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Recorded state history with scrub, replay and clear; applying a past state updates the frame
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
