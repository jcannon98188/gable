---
id: TASK-75.5
title: 'Editor: collaboration UX (presence, remote cursors, provider adapter)'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T06:52:00Z'
labels:
  - editor
dependencies:
  - TASK-75.2
  - TASK-75.3
parent_task_id: TASK-75
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Users need to see who else is editing. Awareness is also needed by comments and track changes (author identity and colours).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Remote cursors and selections rendered with user name and colour
- [x] #2 Presence list component
- [x] #3 Provider-agnostic adapter (works with any Yjs provider incl. y-websocket; awareness via y-protocols or our own)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. awareness.ts: awarenessPlugin (y-protocols Awareness): publishes user + relative-position selection, renders remote carets/selections as PM decorations; watchPresence view-model.
2. provider.ts: CollabProvider interface, adapter for y-websocket-shaped providers, in-memory linked provider for tests/demos; collabPlugin gains whenSynced to delay seeding.
3. <gable-presence> + awareness input on <gable-editor>.
4. Tests (two clients, cursors follow edits) and an example app with two clients.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
awarenessPlugin/watchPresence (y-protocols Awareness), <gable-presence>, awareness/user/whenSynced inputs on <gable-editor>, adaptProvider (y-websocket/Hocuspocus shape), createLocalProvider/linkPeers (in-memory). Axe found role=img on li: fixed. collabPlugin now takes whenSynced and never seeds an untouched empty editor. 66 editor tests. The two-client demo AC moved to TASK-75.8: examples use vendored tarballs (scripts/pack-local) so adding an example app is its own piece of work.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Presence, remote cursors/selections, provider adapters and in-memory linked peers. Verified by 66 tests incl. two <gable-editor> components with presence and cursors.
<!-- SECTION:FINAL_SUMMARY:END -->
