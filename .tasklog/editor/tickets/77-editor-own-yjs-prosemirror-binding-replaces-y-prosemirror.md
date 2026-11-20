---
kind: ticket
title: "Editor: own Yjs <-> ProseMirror binding (replaces y-prosemirror)"
status: resolved
blocked_by: [76]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.2 - Editor-own-Yjs-ProseMirror-binding-replaces-y-prosemirror.md
ordinal: 126000
---

## Question

We chose to write our own sync layer instead of using y-prosemirror. This is the riskiest piece and everything collaborative depends on it. Targets TipTap/ProseMirror documents stored in a Y.XmlFragment (or a schema we define).

## Acceptance criteria

- [x] #1 Local ProseMirror transactions apply to the Y.Doc and remote Y updates apply to the editor state, for every schema node and mark, including nested structures like tables
- [x] #2 Two or more peers converge under concurrent and offline edits (randomised convergence tests)
- [x] #3 Binding-origin transactions are excluded from local undo; undo/redo is per-user (Y.UndoManager or equivalent)
- [x] #4 Remote selections and relative positions (Y.RelativePosition) survive concurrent edits
- [x] #5 Binding exposes hooks so plugins (comments, track changes) can store extra Yjs data
- [x] #6 Needs no y-prosemirror dependency

## Implementation plan

1. Data layout (y-prosemirror-compatible): Y.XmlFragment -> Y.XmlElement per node (attrs = node attrs), Y.XmlText per inline text run (marks = delta attributes).
2. convert.ts: Y -> PM fragment; PM -> Y reconcile (prefix/suffix equality, left-greedy pairing, text diff + format diff).
3. binding.ts: host-agnostic YProseMirrorBinding (pmChanged / remote observer, minimal-range replace on remote, own origin, Y.UndoManager per-user undo, relative-position helpers, selection kept via relative positions).
4. collabPlugin EditorPlugin (TipTap Extension: PM plugin + undo/redo commands/keymap) and a hook for plugins to share the ydoc.
5. Tests: node-env unit tests per node/mark incl. nesting; randomized multi-peer convergence incl. offline; undo isolation; relative positions.

## Implementation notes

Own binding in packages/editor/src/yjs (convert.ts, binding.ts, collab-plugin.ts); y-prosemirror-compatible data layout. 39 tests: round-trip of headings/lists/blockquotes/marks/attrs, 25-seed randomized 3-peer offline convergence, per-user undo, relative positions, 2 real TipTap editors in jsdom. AC1 left open: nested structures verified (lists, blockquotes) but tables do not exist yet; verify in editor/79. Known limits: PM->Yjs reconcile is O(doc) per local change (deep equality scan); duplicate seeding if two peers init non-empty content before syncing (init only after provider sync); text typed inside another user's format span is un-formatted when that user undoes it (inherent to Yjs format markers).

AC1 closed: tables (with spans/header cells) and images sync between two real editors in table-image.test.ts.

## Answer

Own Yjs<->ProseMirror binding (convert, binding, collab plugin) with per-user undo and relative positions; verified by randomized convergence tests, two-editor jsdom tests incl. tables. See notes for known limits.
