---
id: TASK-75.2
title: 'Editor: own Yjs <-> ProseMirror binding (replaces y-prosemirror)'
status: In Progress
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:40:00Z'
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
- [x] #2 Two or more peers converge under concurrent and offline edits (randomised convergence tests)
- [x] #3 Binding-origin transactions are excluded from local undo; undo/redo is per-user (Y.UndoManager or equivalent)
- [x] #4 Remote selections and relative positions (Y.RelativePosition) survive concurrent edits
- [x] #5 Binding exposes hooks so plugins (comments, track changes) can store extra Yjs data
- [x] #6 Needs no y-prosemirror dependency
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Data layout (y-prosemirror-compatible): Y.XmlFragment -> Y.XmlElement per node (attrs = node attrs), Y.XmlText per inline text run (marks = delta attributes).
2. convert.ts: Y -> PM fragment; PM -> Y reconcile (prefix/suffix equality, left-greedy pairing, text diff + format diff).
3. binding.ts: host-agnostic YProseMirrorBinding (pmChanged / remote observer, minimal-range replace on remote, own origin, Y.UndoManager per-user undo, relative-position helpers, selection kept via relative positions).
4. collabPlugin EditorPlugin (TipTap Extension: PM plugin + undo/redo commands/keymap) and a hook for plugins to share the ydoc.
5. Tests: node-env unit tests per node/mark incl. nesting; randomized multi-peer convergence incl. offline; undo isolation; relative positions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Own binding in packages/editor/src/yjs (convert.ts, binding.ts, collab-plugin.ts); y-prosemirror-compatible data layout. 39 tests: round-trip of headings/lists/blockquotes/marks/attrs, 25-seed randomized 3-peer offline convergence, per-user undo, relative positions, 2 real TipTap editors in jsdom. AC1 left open: nested structures verified (lists, blockquotes) but tables do not exist yet; verify in TASK-75.4. Known limits: PM->Yjs reconcile is O(doc) per local change (deep equality scan); duplicate seeding if two peers init non-empty content before syncing (init only after provider sync); text typed inside another user's format span is un-formatted when that user undoes it (inherent to Yjs format markers).
<!-- SECTION:NOTES:END -->
