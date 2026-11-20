---
kind: ticket
title: "Editor: comments plugin"
status: resolved
blocked_by: [77, 80]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.6 - Editor-comments-plugin.md
ordinal: 130000
---

## Question

CKEditor-style anchored comment threads, as a plugin to prove the plugin API handles anchored external data.

## Acceptance criteria

- [x] #1 Select text and start a thread; threads anchor with Y.RelativePosition and survive concurrent edits
- [x] #2 Reply, resolve and reopen; author and timestamp
- [x] #3 Thread data lives in the Y.Doc and syncs
- [x] #4 Sidebar/gutter UI with active thread highlighting

## Implementation notes

commentsPlugin({ydoc,user}) stores threads in a Y.Map (each thread: from/to relative positions, quote, resolved, messages Y.Array). getComments(editor) API: threads/start/reply/resolve/reopen/remove/setActive/subscribe. Anchors: from assoc 0, to assoc -1; deleting the text orphans the thread (kept, shown with its quote). Resolved threads are not highlighted. <gable-comments [editor]> sidebar; <gable-editor> gained a [(tiptap)] model to hand the editor to it. Toolbar item uses window.prompt like link. Limits: threads are re-read per decoration pass (O(threads)); no mentions or per-message edit/delete.

## Answer

Anchored comment threads in the Y.Doc with reply/resolve/reopen, highlighting and a sidebar component. 71 editor tests incl. two-peer sync, concurrent-edit anchoring and orphaning, and axe.
