---
id: TASK-75.13
title: 'Editor: image caption as a figure with figcaption'
status: Done
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T16:01:00Z'
labels:
  - editor
dependencies: []
parent_task_id: TASK-75
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The image caption is a node attribute edited through the toolbar, so it cannot be formatted, selected or edited in place and is lost by editors that do not know the attribute. A figure/figcaption structure is what CKEditor and HTML itself use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Images with a caption serialise as figure > img + figcaption; the caption is editable rich inline text in place
- [x] #2 Toggling the caption on and off works from the toolbar; existing documents using the caption attribute still load
- [x] #3 Caption edits sync between peers and are covered by tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New figure (image + figcaption) and figcaption (inline*) nodes; toggleImageCaption/setImageCaption commands; Enter in a caption exits to the next paragraph. Legacy caption attribute docs are converted to figures on create and on local edits (never from Yjs, so peers do not each convert). Image node view root is now a div.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Captions are real figure/figcaption content, editable in place, toggled from the toolbar, synced between peers (tests), with legacy attribute documents migrated.
<!-- SECTION:FINAL_SUMMARY:END -->
