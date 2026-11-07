---
id: TASK-46
title: 'gable-ui: Command palette (Command)'
status: To Do
assignee: []
created_date: '2026-11-07T03:32:00Z'
labels:
  - ui
dependencies: []
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Command is a cmdk-style searchable command list, usually shown in a dialog. Zag has no command machine, so it needs its own filtering and keyboard navigation on top of the existing dialog primitive. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Searchable command list with groups, keyboard navigation and an empty state, optionally inside a dialog
- [ ] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->
