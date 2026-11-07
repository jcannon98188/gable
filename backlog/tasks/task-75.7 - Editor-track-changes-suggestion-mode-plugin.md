---
id: TASK-75.7
title: 'Editor: track changes (suggestion mode) plugin'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T07:01:00Z'
labels:
  - editor
dependencies:
  - TASK-75.2
  - TASK-75.5
parent_task_id: TASK-75
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The hardest CKEditor feature: edits made in suggestion mode are recorded as attributed insertions/deletions that can be accepted or rejected. Needs design work on how suggestions interact with concurrent edits in a CRDT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Design note (ADR) written first covering model: marks vs. separate Yjs structure, and conflict semantics
- [x] #2 Suggestion mode records insertions, deletions and format changes with author and time
- [x] #3 Accept/reject individual and all suggestions, syncing across peers
- [x] #4 Interop with comments and undo
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design: docs/adr/0003 (marks recorded in a wrapped view.dispatch, not appendTransaction, so original characters stay in Yjs). suggestionsPlugin({user,mode}) + getSuggestions(editor) {mode,setMode,list,accept,reject,acceptAll,rejectAll,subscribe}; <gable-suggestions [editor]> review panel. Limits (also in ADR): block-joining deletions are refused in suggestion mode; structural edits untracked; format suggestions inline marks only, one per range; one suggestion per mark type per character; API registered in onBeforeCreate so UIs can look it up immediately.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Track changes: insert/delete/format suggestions as marks with author and time, accept/reject (single and all) synced across peers, interop with comments and undo, ADR 0003 and a review panel. 79 editor tests.
<!-- SECTION:FINAL_SUMMARY:END -->
