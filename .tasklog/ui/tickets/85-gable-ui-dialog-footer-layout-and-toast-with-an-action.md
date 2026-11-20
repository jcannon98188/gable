---
kind: ticket
title: "gable-ui: Dialog footer layout and toast with an action"
status: resolved
tags:
  - gable-ui
  - priority-medium
created: 2026-11-07
updated: 2026-11-07
imported_from: backlog/tasks/task-85 - gable-ui-Dialog-footer-layout-and-toast-with-an-action.md
priority: medium
ordinal: 142000
---

## Question

The design's toast shows the file and line plus an Undo action; dialogs need a footer layout (inference).

## Acceptance criteria

- [x] #1 ui-dialog has a footer region with consistent alignment and a stacked layout on narrow widths
- [x] #2 ToastService accepts an action (label and callback), rendered as a button in the toast, which also dismisses it; the toast has a description line
- [x] #3 Tests, an axe check and a gallery demo

## Implementation plan

Footer region and toast action/description already existed; add data-slot, tests, demo

## Implementation notes

ToastService action/description and ui-dialog footer slot (stacked flex-col-reverse, sm:justify-end) already existed; added data-slot=dialog-footer and sm:items-center, dialog-footer.dom.test.ts (footer classes, description + action button runs callback and dismisses, axe), toast demo description line, overlays demo dialog footer.

## Answer

Verified and covered the existing footer and toast action/description with tests and gallery demos; small footer tweak.
