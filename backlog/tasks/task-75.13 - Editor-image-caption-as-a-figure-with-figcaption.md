---
id: TASK-75.13
title: 'Editor: image caption as a figure with figcaption'
status: In Progress
assignee: []
created_date: '2026-11-07T15:21:00Z'
updated_date: '2026-11-07T15:56:00Z'
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
- [ ] #1 Images with a caption serialise as figure > img + figcaption; the caption is editable rich inline text in place
- [ ] #2 Toggling the caption on and off works from the toolbar; existing documents using the caption attribute still load
- [ ] #3 Caption edits sync between peers and are covered by tests
<!-- AC:END -->
