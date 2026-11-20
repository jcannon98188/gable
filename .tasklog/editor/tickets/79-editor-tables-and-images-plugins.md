---
kind: ticket
title: "Editor: tables and images plugins"
status: resolved
blocked_by: [76, 78]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.4 - Editor-tables-and-images-plugins.md
ordinal: 128000
---

## Question

Tables and images are the first complex schema features and the stress test for the plugin API and the Yjs binding.

## Acceptance criteria

- [x] #1 Tables: insert, add/remove row and column, merge/split cells, header row, column resize
- [x] #2 Images: embed by URL, upload through a pluggable upload adapter, drag-resize, alt text, caption
- [x] #3 Both sync correctly between peers via the Yjs binding

## Implementation plan

1. tablePlugin: TipTap table extensions (resizable columns) + toolbar items for row/col ops, merge/split, header row.
2. imagePlugin: Image with width/alt/caption attrs, drag-resize node view, URL embed command, pluggable upload adapter (paste/drop/command).
3. Tests: commands, HTML round trip, upload adapter, and Yjs sync of tables/images between two peers (closes 75.2 AC1 for tables).

## Implementation notes

tablePlugin/imagePlugin in src/plugins. Image caption is a node attribute rendered in a figcaption by the node view (edited through a toolbar input), not an editable nested node; resize handle supports pointer drag and arrow keys. Upload via ImageUploader adapter (command, paste, drop). 6 tests incl. Yjs sync of tables/images and per-user undo.

## Answer

Table and image plugins with toolbar items, resize node view, upload adapter, verified by 6 jsdom tests including two-editor Yjs sync. Also closes editor/77 AC1.
