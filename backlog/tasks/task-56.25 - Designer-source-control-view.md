---
id: TASK-56.25
title: 'Designer: source control view'
status: To Do
assignee: []
created_date: '2026-11-07T18:28:00Z'
labels:
  - needs-triage
dependencies:
  - TASK-56.9
parent_task_id: TASK-56
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show changed files with grouped diffs, commit a selection, revert one visual change or file, using git via the backend. Render diffs with the new gable-ui syntax/diff renderer (being added by the user) instead of the Designer's own diff view. First check what already exists in packages/designer (and the devtools hook) so you build on it rather than duplicate; follow ADR 0001 (source is the truth, edits are minimal patches with undo), no fake data, protocol changes additive, MCP tools for anything an agent should drive, README section, driven headless check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Changed-files view with diffs rendered by gable-ui; commit and revert from the Designer
- [ ] #2 Exposed through the MCP control plane where an agent would drive it
- [ ] #3 Tests added; tsc, designer build, full vitest and a headless Edge check pass
<!-- AC:END -->
