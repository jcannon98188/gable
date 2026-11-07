---
id: TASK-26
title: 'First gable-ui components: Button, Dialog, Popover, Tabs, Tooltip, Select'
status: To Do
assignee: []
created_date: '2026-11-07 02:24'
labels:
  - ui
  - ready-for-agent
dependencies:
  - TASK-25
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Styled components in the shadcn style (Tailwind, class-variance-authority equivalents as computed view models because templates cannot call functions, tailwind-merge, clsx, lucide). Includes data-state styling for enter and exit animation. Browser look and feel needs a human check at the end. Select may be blocked by the items research task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Six components implemented with tests on the in-memory renderer
- [ ] #2 An example app in examples/ shows them all, with Tailwind working under HMR
- [ ] #3 User has checked animation, focus rings and positioning in a real browser
<!-- AC:END -->
