---
id: TASK-56.23
title: 'Designer: design tokens beyond Tailwind (CSS variables)'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies: []
parent_task_id: TASK-56
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read CSS custom properties (light/dark pairs and overrides) from the project's stylesheets; Style panel edits the token not a one-off value, shows where a token is used and counts uses. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Token list with light/dark values; edit a token through the edit service; usage count and jump
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
