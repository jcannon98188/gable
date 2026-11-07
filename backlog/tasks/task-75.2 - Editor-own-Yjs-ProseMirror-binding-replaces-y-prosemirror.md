---
id: TASK-75.2
title: 'Editor: own Yjs <-> ProseMirror binding (replaces y-prosemirror)'
status: To Do
assignee: []
created_date: '2026-11-07T06:33:00Z'
labels:
  - editor
dependencies:
  - TASK-75.1
parent_task_id: TASK-75
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
We chose to write our own sync layer instead of using y-prosemirror. This is the riskiest piece and everything collaborative depends on it. Targets TipTap/ProseMirror documents stored in a Y.XmlFragment (or a schema we define).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Local ProseMirror transactions apply to the Y.Doc and remote Y updates apply to the editor state, for every schema node and mark, including nested structures like tables
- [ ] #2 Two or more peers converge under concurrent and offline edits (randomised convergence tests)
- [ ] #3 Binding-origin transactions are excluded from local undo; undo/redo is per-user (Y.UndoManager or equivalent)
- [ ] #4 Remote selections and relative positions (Y.RelativePosition) survive concurrent edits
- [ ] #5 Binding exposes hooks so plugins (comments, track changes) can store extra Yjs data
- [ ] #6 Needs no y-prosemirror dependency
<!-- AC:END -->
