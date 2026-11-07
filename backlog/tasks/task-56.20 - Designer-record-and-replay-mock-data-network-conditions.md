---
id: TASK-56.20
title: 'Designer: record and replay mock data, network conditions'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Page mode: record real dev-API responses into mockHttp scenarios, edit them, and switch a frame to slow, 500 or offline. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Record real responses into a mock scenario; per-frame slow/error/offline conditions
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
