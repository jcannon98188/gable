---
id: TASK-75
title: '@gable/editor: collaborative rich text editor (TipTap + own Yjs binding)'
status: Done
assignee: []
created_date: '2026-11-07T06:33:00Z'
updated_date: '2026-11-07T16:01:00Z'
labels:
  - editor
dependencies: []
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
We want a CKEditor-class rich text editor for Gable apps. It is built on TipTap/ProseMirror for the editing model, with our own Yjs binding for collaboration (we do not want to depend on y-prosemirror) and a plugin API so features ship as plugins. Lives in packages/editor: framework-agnostic core, with a Gable component wrapper and a toolbar built from gable-ui primitives. First milestone covers core formatting, tables and images, collaboration UX, comments and track changes, all as plugins on one plugin API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All subtasks Done
<!-- AC:END -->
