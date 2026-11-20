---
kind: ticket
title: "Editor: track changes (suggestion mode) plugin"
status: resolved
blocked_by: [77, 80]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.7 - Editor-track-changes-suggestion-mode-plugin.md
ordinal: 131000
---

## Question

The hardest CKEditor feature: edits made in suggestion mode are recorded as attributed insertions/deletions that can be accepted or rejected. Needs design work on how suggestions interact with concurrent edits in a CRDT.

## Acceptance criteria

- [x] #1 Design note (ADR) written first covering model: marks vs. separate Yjs structure, and conflict semantics
- [x] #2 Suggestion mode records insertions, deletions and format changes with author and time
- [x] #3 Accept/reject individual and all suggestions, syncing across peers
- [x] #4 Interop with comments and undo

## Implementation notes

Design: docs/adr/0003 (marks recorded in a wrapped view.dispatch, not appendTransaction, so original characters stay in Yjs). suggestionsPlugin({user,mode}) + getSuggestions(editor) {mode,setMode,list,accept,reject,acceptAll,rejectAll,subscribe}; <gable-suggestions [editor]> review panel. Limits (also in ADR): block-joining deletions are refused in suggestion mode; structural edits untracked; format suggestions inline marks only, one per range; one suggestion per mark type per character; API registered in onBeforeCreate so UIs can look it up immediately.

## Answer

Track changes: insert/delete/format suggestions as marks with author and time, accept/reject (single and all) synced across peers, interop with comments and undo, ADR 0003 and a review panel. 79 editor tests.
