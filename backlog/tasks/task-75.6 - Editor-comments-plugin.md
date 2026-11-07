---
id: TASK-75.6
title: 'Editor: comments plugin'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:56:00Z'
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
- [x] #1 Select text and start a thread; threads anchor with Y.RelativePosition and survive concurrent edits
- [x] #2 Reply, resolve and reopen; author and timestamp
- [x] #3 Thread data lives in the Y.Doc and syncs
- [x] #4 Sidebar/gutter UI with active thread highlighting
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
commentsPlugin({ydoc,user}) stores threads in a Y.Map (each thread: from/to relative positions, quote, resolved, messages Y.Array). getComments(editor) API: threads/start/reply/resolve/reopen/remove/setActive/subscribe. Anchors: from assoc 0, to assoc -1; deleting the text orphans the thread (kept, shown with its quote). Resolved threads are not highlighted. <gable-comments [editor]> sidebar; <gable-editor> gained a [(tiptap)] model to hand the editor to it. Toolbar item uses window.prompt like link. Limits: threads are re-read per decoration pass (O(threads)); no mentions or per-message edit/delete.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Anchored comment threads in the Y.Doc with reply/resolve/reopen, highlighting and a sidebar component. 71 editor tests incl. two-peer sync, concurrent-edit anchoring and orphaning, and axe.
<!-- SECTION:FINAL_SUMMARY:END -->
