---
kind: ticket
title: "Editor: collaboration UX (presence, remote cursors, provider adapter)"
status: resolved
blocked_by: [77, 78]
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.5 - Editor-collaboration-UX-presence-remote-cursors-provider-adapter.md
ordinal: 129000
---

## Question

Users need to see who else is editing. Awareness is also needed by comments and track changes (author identity and colours).

## Acceptance criteria

- [x] #1 Remote cursors and selections rendered with user name and colour
- [x] #2 Presence list component
- [x] #3 Provider-agnostic adapter (works with any Yjs provider incl. y-websocket; awareness via y-protocols or our own)

## Implementation plan

1. awareness.ts: awarenessPlugin (y-protocols Awareness): publishes user + relative-position selection, renders remote carets/selections as PM decorations; watchPresence view-model.
2. provider.ts: CollabProvider interface, adapter for y-websocket-shaped providers, in-memory linked provider for tests/demos; collabPlugin gains whenSynced to delay seeding.
3. <gable-presence> + awareness input on <gable-editor>.
4. Tests (two clients, cursors follow edits) and an example app with two clients.

## Implementation notes

awarenessPlugin/watchPresence (y-protocols Awareness), <gable-presence>, awareness/user/whenSynced inputs on <gable-editor>, adaptProvider (y-websocket/Hocuspocus shape), createLocalProvider/linkPeers (in-memory). Axe found role=img on li: fixed. collabPlugin now takes whenSynced and never seeds an untouched empty editor. 66 editor tests. The two-client demo AC moved to editor/83: examples use vendored tarballs (scripts/pack-local) so adding an example app is its own piece of work.

## Answer

Presence, remote cursors/selections, provider adapters and in-memory linked peers. Verified by 66 tests incl. two <gable-editor> components with presence and cursors.
