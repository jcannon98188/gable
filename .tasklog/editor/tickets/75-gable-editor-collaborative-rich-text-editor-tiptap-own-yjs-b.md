---
kind: ticket
title: "@gable/editor: collaborative rich text editor (TipTap + own Yjs binding)"
status: resolved
tags:
  - editor
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-75 - gable-editor-collaborative-rich-text-editor-TipTap-own-Yjs-binding.md
ordinal: 124000
---

## Question

We want a CKEditor-class rich text editor for Gable apps. It is built on TipTap/ProseMirror for the editing model, with our own Yjs binding for collaboration (we do not want to depend on y-prosemirror) and a plugin API so features ship as plugins. Lives in packages/editor: framework-agnostic core, with a Gable component wrapper and a toolbar built from gable-ui primitives. First milestone covers core formatting, tables and images, collaboration UX, comments and track changes, all as plugins on one plugin API.

## Acceptance criteria

- [ ] #1 All subtasks Done
