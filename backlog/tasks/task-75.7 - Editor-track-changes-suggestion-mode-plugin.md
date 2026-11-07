---
id: TASK-75.7
title: 'Editor: track changes (suggestion mode) plugin'
status: To Do
assignee: []
created_date: '2026-11-07T06:33:00Z'
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
- [ ] #1 Design note (ADR) written first covering model: marks vs. separate Yjs structure, and conflict semantics
- [ ] #2 Suggestion mode records insertions, deletions and format changes with author and time
- [ ] #3 Accept/reject individual and all suggestions, syncing across peers
- [ ] #4 Interop with comments and undo
<!-- AC:END -->
