---
kind: ticket
title: "Editor: lucide icons for every toolbar item"
status: resolved
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.10 - Editor-lucide-icons-for-every-toolbar-item.md
ordinal: 155000
---

## Question

Toolbar buttons use text glyphs; table items show truncated two-letter labels ("Ad", "De") and are indistinguishable. gable-ui uses lucide through the UiIcon directive and its ICONS registry, so the editor should use lucide icons the same way, with an accessible name on every button.

## Acceptance criteria

- [x] #1 Every built-in toolbar item (styles, headings, lists, table ops, image, comment, suggestion mode, undo/redo) shows a lucide icon with aria-label and tooltip
- [x] #2 Icons come from lucide via the same UiIcon mechanism; a plugin can supply its own icon name; items without one fall back to a text label
- [x] #3 No axe violations; icon-only buttons keep an accessible name

## Implementation notes

Lucide covers every glyph; no extra icon package needed. ToolbarItem.icon (optional) + ITEM_ICONS default map by id, registered into @gablejs/ui ICONS as ed-*. Label text remains as aria-label/title; label shown only when no icon.

## Answer

All toolbar items (formatting, table, image, comment, suggestion mode, undo/redo) render lucide glyphs via svg[uiIcon]; tests assert coverage and accessible names.
