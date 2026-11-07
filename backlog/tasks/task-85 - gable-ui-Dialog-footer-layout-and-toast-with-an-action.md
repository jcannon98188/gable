---
id: TASK-85
title: 'gable-ui: Dialog footer layout and toast with an action'
status: Done
assignee: []
created_date: '2026-11-07T06:37:00Z'
updated_date: '2026-11-07T06:50:00Z'
labels:
  - gable-ui
dependencies: []
priority: medium
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design's toast shows the file and line plus an Undo action; dialogs need a footer layout (inference).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui-dialog has a footer region with consistent alignment and a stacked layout on narrow widths
- [x] #2 ToastService accepts an action (label and callback), rendered as a button in the toast, which also dismisses it; the toast has a description line
- [x] #3 Tests, an axe check and a gallery demo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Footer region and toast action/description already existed; add data-slot, tests, demo
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ToastService action/description and ui-dialog footer slot (stacked flex-col-reverse, sm:justify-end) already existed; added data-slot=dialog-footer and sm:items-center, dialog-footer.dom.test.ts (footer classes, description + action button runs callback and dismisses, axe), toast demo description line, overlays demo dialog footer.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified and covered the existing footer and toast action/description with tests and gallery demos; small footer tweak.
<!-- SECTION:FINAL_SUMMARY:END -->
