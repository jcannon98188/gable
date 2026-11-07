---
id: TASK-56.26
title: 'Designer: accessibility depth (focus order, keyboard mode, a11y tree)'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Overlay of tab/focus order on the canvas, keyboard-only mode, and an accessibility-tree outline for the selected frame, building on the axe Accessibility tab. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focus order overlay, accessibility tree view, keyboard-only mode
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
