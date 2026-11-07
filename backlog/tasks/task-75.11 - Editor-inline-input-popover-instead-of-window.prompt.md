---
id: TASK-75.11
title: 'Editor: inline input popover instead of window.prompt'
status: To Do
assignee: []
created_date: '2026-11-07T15:21:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The link, comment and image alt/caption toolbar items collect input with window.prompt, which is blocking, unstyled, untestable in real browsers and unusable in embedded webviews. ToolbarItem already declares an input kind; the toolbar UI should render an inline popover for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toolbar items with an input open an inline popover (label, field, Apply and Cancel) anchored to the toolbar; Enter applies, Escape cancels and returns focus to the editor
- [ ] #2 Link popover is prefilled with the current href and offers Remove when on a link
- [ ] #3 window.prompt is no longer used anywhere in the package; tests cover apply, cancel and keyboard use, with axe clean
<!-- AC:END -->
