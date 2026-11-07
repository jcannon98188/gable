---
id: TASK-56.17
title: 'Designer: signal state editing and save-as-Scenario'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inspector can set a signal's value (typed, JSON-validated, reversible) in the selected frame, and pin values; a 'Save as Scenario' action writes the current poked state into the component's *.scenes.ts through the existing Scenario writer. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Set and pin signal values from the Inspector; Save as Scenario writes a working scene
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
