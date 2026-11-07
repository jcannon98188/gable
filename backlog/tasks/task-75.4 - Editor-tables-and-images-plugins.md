---
id: TASK-75.4
title: 'Editor: tables and images plugins'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:47:00Z'
labels:
  - editor
dependencies:
  - TASK-75.1
  - TASK-75.3
parent_task_id: TASK-75
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tables and images are the first complex schema features and the stress test for the plugin API and the Yjs binding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tables: insert, add/remove row and column, merge/split cells, header row, column resize
- [x] #2 Images: embed by URL, upload through a pluggable upload adapter, drag-resize, alt text, caption
- [x] #3 Both sync correctly between peers via the Yjs binding
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tablePlugin: TipTap table extensions (resizable columns) + toolbar items for row/col ops, merge/split, header row.
2. imagePlugin: Image with width/alt/caption attrs, drag-resize node view, URL embed command, pluggable upload adapter (paste/drop/command).
3. Tests: commands, HTML round trip, upload adapter, and Yjs sync of tables/images between two peers (closes 75.2 AC1 for tables).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tablePlugin/imagePlugin in src/plugins. Image caption is a node attribute rendered in a figcaption by the node view (edited through a toolbar input), not an editable nested node; resize handle supports pointer drag and arrow keys. Upload via ImageUploader adapter (command, paste, drop). 6 tests incl. Yjs sync of tables/images and per-user undo.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Table and image plugins with toolbar items, resize node view, upload adapter, verified by 6 jsdom tests including two-editor Yjs sync. Also closes TASK-75.2 AC1.
<!-- SECTION:FINAL_SUMMARY:END -->
