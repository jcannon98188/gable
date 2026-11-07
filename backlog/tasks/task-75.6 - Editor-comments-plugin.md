---
id: TASK-75.6
title: 'Editor: comments plugin'
status: To Do
assignee: []
created_date: '2026-11-07T06:33:00Z'
labels:
  - editor
dependencies:
  - TASK-75.2
  - TASK-75.5
parent_task_id: TASK-75
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CKEditor-style anchored comment threads, as a plugin to prove the plugin API handles anchored external data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Select text and start a thread; threads anchor with Y.RelativePosition and survive concurrent edits
- [ ] #2 Reply, resolve and reopen; author and timestamp
- [ ] #3 Thread data lives in the Y.Doc and syncs
- [ ] #4 Sidebar/gutter UI with active thread highlighting
<!-- AC:END -->
