---
id: TASK-75.4
title: 'Editor: tables and images plugins'
status: To Do
assignee: []
created_date: '2026-11-07T06:33:00Z'
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
- [ ] #1 Tables: insert, add/remove row and column, merge/split cells, header row, column resize
- [ ] #2 Images: embed by URL, upload through a pluggable upload adapter, drag-resize, alt text, caption
- [ ] #3 Both sync correctly between peers via the Yjs binding
<!-- AC:END -->
