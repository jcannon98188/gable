---
id: TASK-75.10
title: 'Editor: lucide icons for every toolbar item'
status: To Do
assignee: []
created_date: '2026-11-07T15:21:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Toolbar buttons use text glyphs; table items show truncated two-letter labels ("Ad", "De") and are indistinguishable. gable-ui uses lucide through the UiIcon directive and its ICONS registry, so the editor should use lucide icons the same way, with an accessible name on every button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every built-in toolbar item (styles, headings, lists, table ops, image, comment, suggestion mode, undo/redo) shows a lucide icon with aria-label and tooltip
- [ ] #2 Icons come from lucide via the same UiIcon mechanism; a plugin can supply its own icon name; items without one fall back to a text label
- [ ] #3 No axe violations; icon-only buttons keep an accessible name
<!-- AC:END -->
