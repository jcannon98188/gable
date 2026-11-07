---
id: TASK-75.11
title: 'Editor: inline input popover instead of window.prompt'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:34:00Z'
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
- [x] #1 Toolbar items with an input open an inline popover (label, field, Apply and Cancel) anchored to the toolbar; Enter applies, Escape cancels and returns focus to the editor
- [x] #2 Link popover is prefilled with the current href and offers Remove when on a link
- [x] #3 window.prompt is no longer used anywhere in the package; tests cover apply, cancel and keyboard use, with axe clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ToolbarItem.input gained initial() and removeLabel. Popover is a labelled <form> under the toolbar; field autofocused; Enter/Apply applies, Escape/Cancel closes and refocuses the editor. Also fixes an old quirk: image items on a selected image previously did nothing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
window.prompt removed. Link/comment/image alt/caption use an inline popover; link is prefilled and has Remove link. DOM tests cover apply, Enter, Escape, prefill/remove, axe clean.
<!-- SECTION:FINAL_SUMMARY:END -->
