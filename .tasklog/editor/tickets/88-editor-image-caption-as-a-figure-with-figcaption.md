---
kind: ticket
title: "Editor: image caption as a figure with figcaption"
status: resolved
tags:
  - editor
  - parent-75
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75.13 - Editor-image-caption-as-a-figure-with-figcaption.md
ordinal: 158000
---

## Question

The image caption is a node attribute edited through the toolbar, so it cannot be formatted, selected or edited in place and is lost by editors that do not know the attribute. A figure/figcaption structure is what CKEditor and HTML itself use.

## Acceptance criteria

- [x] #1 Images with a caption serialise as figure > img + figcaption; the caption is editable rich inline text in place
- [x] #2 Toggling the caption on and off works from the toolbar; existing documents using the caption attribute still load
- [x] #3 Caption edits sync between peers and are covered by tests

## Implementation notes

New figure (image + figcaption) and figcaption (inline*) nodes; toggleImageCaption/setImageCaption commands; Enter in a caption exits to the next paragraph. Legacy caption attribute docs are converted to figures on create and on local edits (never from Yjs, so peers do not each convert). Image node view root is now a div.

## Answer

Captions are real figure/figcaption content, editable in place, toggled from the toolbar, synced between peers (tests), with legacy attribute documents migrated.
