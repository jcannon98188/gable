---
kind: ticket
title: "Editor: inline input popover instead of window.prompt"
status: resolved
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.11 - Editor-inline-input-popover-instead-of-window.prompt.md
ordinal: 156000
---

## Question

The link, comment and image alt/caption toolbar items collect input with window.prompt, which is blocking, unstyled, untestable in real browsers and unusable in embedded webviews. ToolbarItem already declares an input kind; the toolbar UI should render an inline popover for it.

## Acceptance criteria

- [x] #1 Toolbar items with an input open an inline popover (label, field, Apply and Cancel) anchored to the toolbar; Enter applies, Escape cancels and returns focus to the editor
- [x] #2 Link popover is prefilled with the current href and offers Remove when on a link
- [x] #3 window.prompt is no longer used anywhere in the package; tests cover apply, cancel and keyboard use, with axe clean

## Implementation notes

ToolbarItem.input gained initial() and removeLabel. Popover is a labelled <form> under the toolbar; field autofocused; Enter/Apply applies, Escape/Cancel closes and refocuses the editor. Also fixes an old quirk: image items on a selected image previously did nothing.

## Answer

window.prompt removed. Link/comment/image alt/caption use an inline popover; link is prefilled and has Remove link. DOM tests cover apply, Enter, Escape, prefill/remove, axe clean.
