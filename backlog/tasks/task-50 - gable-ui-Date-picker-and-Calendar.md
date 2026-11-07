---
id: TASK-50
title: 'gable-ui: Date picker and Calendar'
status: To Do
assignee: []
created_date: '2026-11-07T03:32:00Z'
labels:
  - ui
dependencies: []
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
shadcn's Calendar and Date Picker use react-day-picker. Zag has date-picker and uses @internationalized/date, which adds a sizeable dependency and a nontrivial parts API. Deferred from TASK-28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calendar and date picker (single date, optionally range) with keyboard navigation and a popover
- [ ] #2 Component is one file in packages/ui/src/components with a registry-meta entry and tests
- [ ] #3 Shown in examples/ui-gallery
<!-- AC:END -->
